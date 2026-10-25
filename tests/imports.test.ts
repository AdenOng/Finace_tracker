import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import type { Database } from "../src/server/db";
import type { AccountType } from "../src/lib/accounts";
import * as schema from "../src/server/db/schema";
import {
  buildStatementSchema,
  type StatementExtraction,
} from "../src/server/modules/extraction/schemas";
import { checkImportBalance } from "../src/lib/import-balance-check";
import { stagedSchemas } from "../src/server/modules/imports/rows";

const engine = new PGlite();
const db = drizzle(engine, { schema });
await mock.module("server-only", () => ({}));
await mock.module("~/server/db", () => ({ db }));
await mock.module("~/server/auth/config", () => ({
  auth: { api: { getSession: async () => null } },
}));
const { accountsRouter } = await import("../src/server/api/routers/accounts");
const { transfersRouter } = await import("../src/server/api/routers/transfers");
const { importsRouter } = await import("../src/server/api/routers/imports");
const { portfolioRouter } = await import("../src/server/api/routers/portfolio");
const { stageExtraction } = await import("../src/server/modules/imports/stage");
const { resolveAccessScope } = await import("../src/server/lib/access");

function contextFor(id: string) {
  return {
    db: db as unknown as Database,
    headers: new Headers(),
    session: {
      session: {
        id: `session-${id}`,
        userId: id,
        token: `synthetic-token-${id}`,
        expiresAt: new Date(Date.now() + 60_000),
        createdAt: new Date(),
        updatedAt: new Date(),
        ipAddress: null,
        userAgent: null,
        impersonatedBy: null,
      },
      user: {
        id,
        name: `Example ${id}`,
        email: `${id}@example.com`,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
        image: null,
        role: "user",
        banned: false,
        banReason: null,
        banExpires: null,
        twoFactorEnabled: true,
      },
    },
  };
}
const callers = (id: string) => ({
  accounts: accountsRouter.createCaller(contextFor(id)),
  imports: importsRouter.createCaller(contextFor(id)),
});
const alice = callers("alice");
const bob = callers("bob");
let groceriesId: string;

beforeAll(async () => {
  const journal = (await Bun.file(
    new URL("../drizzle/meta/_journal.json", import.meta.url),
  ).json()) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    await engine.exec(
      await Bun.file(new URL(`../drizzle/${tag}.sql`, import.meta.url)).text(),
    );
  }
  await db.insert(schema.user).values([
    { id: "alice", name: "Example Alice", email: "alice@example.com" },
    { id: "bob", name: "Example Bob", email: "bob@example.com" },
  ]);
  await db
    .insert(schema.currency)
    .values({ code: "SGD", name: "Singapore dollar", symbol: "S$" });
  const [groceries] = await db
    .insert(schema.category)
    .values({ key: "groceries", name: "Groceries" })
    .returning();
  groceriesId = groceries!.id;
}, 30_000);
afterAll(async () => {
  await engine.close();
});

const base: StatementExtraction = {
  documentType: "bank_statement",
  institutionName: "Example Bank",
  accountName: null,
  accountLast4: "4821",
  currency: "SGD",
  periodStart: "2026-09-01",
  periodEnd: "2026-09-30",
  openingBalance: 1000,
  openingBalanceDirection: null,
  closingBalance: 7370.15,
  closingBalanceDirection: null,
  transactions: [],
  positions: [],
  cashBalances: [],
  investmentTransactions: [],
  warnings: [],
};
const line = (
  date: string,
  description: string,
  amount: number,
  categoryKey: string | null = null,
): StatementExtraction["transactions"][number] => ({
  date,
  postedDate: null,
  description,
  merchant: null,
  amount,
  printedDirection: null,
  printedAmount: null,
  currency: "SGD",
  originalAmount: null,
  originalCurrency: null,
  categoryKey,
  isTransfer: false,
  reference: null,
});

const tradeLine =
  (): StatementExtraction["investmentTransactions"][number] => ({
    reference: null,
    type: "buy",
    tradeDate: "2026-09-15",
    settleDate: null,
    symbol: "DUPTEST",
    quantity: 2,
    price: 50,
    amount: -101,
    fees: 1,
    currency: "SGD",
    description: "Bought DUPTEST",
  });

/** A document and job as the upload route creates them, staged from a canned extraction. */
async function stagedJob(
  account: { id: string; type: AccountType },
  out: StatementExtraction,
  name: string,
) {
  const [doc] = await db
    .insert(schema.document)
    .values({
      ownerId: "alice",
      accountId: account.id,
      fileName: `${name}.pdf`,
      mimeType: "application/pdf",
      sizeBytes: 1,
      sha256: name,
      storageKey: `alice/${name}.pdf`,
    })
    .returning();
  const [job] = await db
    .insert(schema.extractionJob)
    .values({
      ownerId: "alice",
      documentId: doc!.id,
      status: "needs_review",
      result: out,
    })
    .returning();
  await (db as unknown as Database).transaction((tx) =>
    stageExtraction(
      tx,
      resolveAccessScope("alice"),
      job!.id,
      { ...account, currency: "SGD" },
      out,
    ),
  );
  return job!.id;
}

describe("statement imports", () => {
  test("old extraction and staged rows without references still parse", () => {
    const bank = Object.fromEntries(
      Object.entries(line("2026-09-01", "Coffee", -5)).filter(
        ([key]) => key !== "reference",
      ),
    );
    const trade = Object.fromEntries(
      Object.entries(tradeLine()).filter(([key]) => key !== "reference"),
    );
    const extracted = buildStatementSchema(["groceries"]).parse({
      ...base,
      transactions: [bank],
      investmentTransactions: [trade],
    });
    expect(extracted.transactions[0]!.reference).toBeNull();
    expect(extracted.investmentTransactions[0]!.reference).toBeNull();
    expect(
      stagedSchemas.transaction.parse({
        postedDate: bank.date,
        transactionDate: null,
        description: bank.description,
        merchant: null,
        amount: "-5",
        currency: "SGD",
        originalAmount: null,
        originalCurrency: null,
        categoryId: null,
        isTransfer: false,
      }).reference,
    ).toBeNull();
    expect(
      stagedSchemas.investment_transaction.parse({
        ...trade,
        quantity: "2",
        price: "50",
        amount: "-101",
        fees: "1",
      }).reference,
    ).toBeNull();
  });
  test("blank manual entries cannot mask imports; historical imports identify the newer account date", async () => {
    const account = await alice.accounts.create({
      name: "Historical broker",
      type: "brokerage",
      institutionId: null,
      currency: "SGD",
      last4: "",
      notes: "",
    });
    const portfolio = portfolioRouter.createCaller(contextFor("alice"));
    await expect(
      portfolio.recordSnapshot({
        accountId: account.id,
        asOf: "2026-10-19",
        positions: [],
        cash: [],
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    // Reproduce the original installation's blank record created before this fix.
    await db.insert(schema.accountSnapshot).values({
      ownerId: "alice",
      accountId: account.id,
      asOf: "2026-10-19",
      source: "manual",
    });
    const jobId = await stagedJob(
      { id: account.id, type: "brokerage" },
      {
        ...base,
        documentType: "brokerage_statement",
        positions: [
          {
            symbol: "IMPORT",
            exchange: "",
            name: "Imported holding",
            assetClass: "stock",
            quantity: 10,
            averageCost: null,
            marketPrice: 20,
            marketValue: 200,
            currency: "SGD",
          },
        ],
        cashBalances: [{ currency: "SGD", amount: 59.12, bucket: null }],
      },
      "broker-history-regression",
    );
    const before = await alice.imports.get({ id: jobId });
    expect(before.latestHoldingsAsOf).toBeNull();
    expect(before.importedHoldingsAsOf).toBeNull();
    await alice.imports.commit({
      jobId,
      asOf: "2026-09-30",
    });
    expect((await alice.accounts.get(account)).holdings).toMatchObject({
      asOf: "2026-09-30",
      source: "statement",
      positions: [{ symbol: "IMPORT" }],
    });
    expect(await alice.imports.get({ id: jobId })).toMatchObject({
      latestHoldingsAsOf: "2026-09-30",
      importedHoldingsAsOf: "2026-09-30",
    });

    await portfolio.recordSnapshot({
      accountId: account.id,
      asOf: "2026-10-19",
      positions: [],
      cash: [{ currency: "SGD", amount: "0" }],
    });
    expect(await alice.imports.get({ id: jobId })).toMatchObject({
      latestHoldingsAsOf: "2026-10-19",
      importedHoldingsAsOf: "2026-09-30",
    });
    // A second historical import preserves the intentional, newer zero balance.
    const olderJob = await stagedJob(
      { id: account.id, type: "brokerage" },
      {
        ...base,
        documentType: "brokerage_statement",
        cashBalances: [{ currency: "SGD", amount: 50, bucket: null }],
      },
      "broker-older-history-regression",
    );
    expect((await alice.imports.get({ id: olderJob })).latestHoldingsAsOf).toBe(
      "2026-10-19",
    );
    await alice.imports.commit({
      jobId: olderJob,
      asOf: "2026-08-31",
    });
    expect((await alice.accounts.get(account)).holdings?.asOf).toBe(
      "2026-10-19",
    );
    expect(await alice.imports.get({ id: olderJob })).toMatchObject({
      latestHoldingsAsOf: "2026-10-19",
      importedHoldingsAsOf: "2026-08-31",
    });
    const history = await portfolio.history({ accountId: account.id });
    expect(history.entries.find((r) => r.asOf === "2026-09-30")?.importId).toBe(
      jobId,
    );
    expect(history.entries.find((r) => r.asOf === "2026-08-31")?.importId).toBe(
      olderJob,
    );
    expect(
      history.entries.find((r) => r.asOf === "2026-10-19")?.importId,
    ).toBeNull();
    await expect(bob.imports.get({ id: olderJob })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
  test("stages bank lines with duplicates marked, then commits once", async () => {
    const account = await alice.accounts.create({
      name: "Everyday",
      type: "checking",
      institutionId: null,
      currency: "SGD",
      last4: "",
      notes: "",
    });
    await db.insert(schema.transaction).values([
      {
        ownerId: "alice",
        accountId: account.id,
        postedDate: "2026-09-01",
        description: "SALARY GIRO ACME",
        amount: "6500",
        currency: "SGD",
        fingerprint: "manual:salary",
      },
      {
        ownerId: "alice",
        accountId: account.id,
        postedDate: "2026-09-12",
        description: "Kopi with Sam",
        amount: "-4.20",
        currency: "SGD",
        fingerprint: "manual:kopi",
      },
    ]);
    const jobId = await stagedJob(
      { id: account.id, type: "checking" },
      {
        ...base,
        transactions: [
          line("2026-09-01", "salary giro  ACME", 6500),
          line("2026-09-10", "NETS FAIRPRICE", -64.35, "groceries"),
          line("2026-09-12", "TOAST BOX", -4.2),
          line("2026-09-20", "PAYNOW TO JASON", 0),
        ],
      },
      "bank-sep",
    );

    const job = await alice.imports.get({ id: jobId });
    expect(job.summary?.closingBalance).toBe(7370.15);
    expect(job.rows.map((r) => [r.kind, r.matchStatus, r.decision])).toEqual([
      ["transaction", "duplicate", "skip"],
      ["transaction", "new", "accept"],
      ["transaction", "possible_duplicate", "pending"],
      ["cash_balance", "new", "accept"],
    ]);
    const groceries = job.rows[1]!;
    expect(groceries.kind === "transaction" && groceries.data).toMatchObject({
      amount: "-64.35",
      categoryId: groceriesId,
    });

    await expect(bob.imports.get({ id: jobId })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      bob.imports.commit({ jobId, asOf: "2026-09-30" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });

    await expect(
      alice.imports.commit({
        jobId,
        asOf: "2026-09-30",
      }),
    ).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: "Choose Keep or Skip for every possible duplicate before saving",
    });
    expect(
      await db.$count(
        schema.accountSnapshot,
        eq(schema.accountSnapshot.accountId, account.id),
      ),
    ).toBe(0);
    await alice.imports.updateRows({
      jobId,
      ids: [job.rows[2]!.id],
      decision: "accept",
    });

    expect(
      await alice.imports.commit({
        jobId,
        asOf: "2026-09-30",
        acknowledgeBalanceMismatch: true,
      }),
    ).toMatchObject({ transactions: 2, balances: 1, duplicates: 0 });
    const saved = await db
      .select()
      .from(schema.transaction)
      .where(
        and(
          eq(schema.transaction.accountId, account.id),
          eq(schema.transaction.source, "statement"),
        ),
      );
    expect(saved.map((t) => t.description).sort()).toEqual([
      "NETS FAIRPRICE",
      "TOAST BOX",
    ]);
    expect((await alice.accounts.get(account)).holdings).toMatchObject({
      asOf: "2026-09-30",
      source: "statement",
    });
    expect((await alice.imports.get({ id: jobId })).status).toBe("completed");
    await expect(
      alice.imports.commit({
        jobId,
        asOf: "2026-09-30",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("stages and saves brokerage holdings as one snapshot", async () => {
    const account = await alice.accounts.create({
      name: "Broker",
      type: "brokerage",
      institutionId: null,
      currency: "SGD",
      last4: "",
      notes: "",
    });
    const jobId = await stagedJob(
      { id: account.id, type: "brokerage" },
      {
        ...base,
        documentType: "screenshot",
        transactions: [line("2026-10-16", "ignored on a brokerage", -1)],
        positions: [
          {
            symbol: "D05",
            exchange: "XSES",
            name: "DBS Group Holdings",
            assetClass: "stock",
            quantity: 300,
            averageCost: null,
            marketPrice: 39.2,
            marketValue: 11760,
            currency: "SGD",
          },
        ],
        cashBalances: [{ currency: "SGD", amount: 612.3, bucket: null }],
      },
      "broker-oct",
    );
    const rows = (await alice.imports.get({ id: jobId })).rows;
    expect(rows.map((r) => r.kind)).toEqual(["position", "cash_balance"]);

    await alice.imports.updateRows({
      jobId,
      ids: [rows[1]!.id],
      decision: "skip",
    });
    expect(
      await alice.imports.commit({
        jobId,
        asOf: "2026-10-16",
      }),
    ).toMatchObject({ holdings: 1, balances: 0 });
    const holdings = (await alice.accounts.get(account)).holdings;
    expect(holdings?.positions.map((p) => [p.symbol, p.quantity])).toEqual([
      ["D05", "300.0000000000"],
    ]);
    expect(holdings?.cash).toEqual([]);
    const portfolio = portfolioRouter.createCaller(contextFor("alice"));
    const detail = await portfolio.snapshot({
      accountId: account.id,
      snapshotId: holdings!.snapshotId,
    });
    await portfolio.updateSnapshot({
      snapshotId: detail.id,
      version: detail.version,
      entry: {
        accountId: account.id,
        asOf: detail.asOf,
        positions: [
          {
            symbol: "D05",
            exchange: "XSES",
            name: "DBS Group Holdings",
            assetClass: "stock",
            currency: "SGD",
            quantity: "301",
            averageCost: "30",
            price: "39.2",
            value: "12000",
          },
        ],
        cash: [],
      },
    });
    const adjusted = await portfolio.snapshot({
      accountId: account.id,
      snapshotId: detail.id,
    });
    expect(adjusted).toMatchObject({
      id: detail.id,
      source: "statement",
      documentId: detail.documentId,
      positions: [{ quantity: "301.0000000000", statementValue: "12000.0000" }],
    });
    const imported = await alice.imports.get({ id: jobId });
    expect(imported.importedHoldingsAdjusted).toBe(true);
    expect(imported.rows[0]?.committedRecordId).toBe(detail.id);
    expect(imported.rows[0]?.data).toMatchObject({
      quantity: "300",
      price: "39.2",
    });
    await portfolio.removeSnapshot({
      accountId: account.id,
      snapshotId: detail.id,
      version: adjusted.version,
    });
    expect((await alice.accounts.get(account)).holdings).toBeNull();
    expect(
      (await alice.imports.get({ id: jobId })).importedHoldingsAsOf,
    ).toBeNull();
    expect(
      await db
        .select()
        .from(schema.document)
        .where(eq(schema.document.id, detail.documentId!)),
    ).toHaveLength(1);
  });
});

test("an older overlapping statement keeps repeated bank charges and the newer balance", async () => {
  const account = await alice.accounts.create({
    name: "Repeated charges",
    type: "checking",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const coffee = line("2026-09-15", "COFFEE", -5);
  const newer = await stagedJob(
    { ...account, type: "checking" },
    { ...base, transactions: [coffee], closingBalance: 100 },
    "repeated-charges-newer",
  );
  await alice.imports.commit({
    jobId: newer,
    asOf: "2026-10-01",
    acknowledgeBalanceMismatch: true,
  });
  const older = await stagedJob(
    { ...account, type: "checking" },
    { ...base, transactions: [coffee, coffee], closingBalance: 90 },
    "repeated-charges-older",
  );
  expect(
    (await alice.imports.get({ id: older })).rows
      .filter((r) => r.kind === "transaction")
      .map((r) => [r.matchStatus, r.decision]),
  ).toEqual([
    ["duplicate", "skip"],
    ["new", "accept"],
  ]);
  expect(
    await alice.imports.commit({
      jobId: older,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ transactions: 1, duplicates: 0 });
  expect((await alice.accounts.get(account)).holdings?.asOf).toBe("2026-10-01");

  const repeated = await stagedJob(
    { ...account, type: "checking" },
    { ...base, transactions: [coffee, coffee] },
    "repeated-charges-again",
  );
  const rows = (await alice.imports.get({ id: repeated })).rows.filter(
    (r) => r.kind === "transaction",
  );
  expect(rows.map((r) => r.matchStatus)).toEqual(["duplicate", "duplicate"]);
  // Selecting a known duplicate must not create another transaction.
  await alice.imports.updateRows({
    jobId: repeated,
    ids: rows.map((r) => r.id),
    decision: "accept",
  });
  expect(
    await alice.imports.commit({
      jobId: repeated,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ transactions: 0, duplicates: 2 });
  expect(
    await db.$count(
      schema.transaction,
      eq(schema.transaction.accountId, account.id),
    ),
  ).toBe(2);
  expect((await alice.imports.get({ id: repeated })).statementDates).toEqual([
    "2026-10-01",
    "2026-09-30",
  ]);
  // The same numeric amount in another currency is a different charge.
  const foreign = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      closingBalance: null,
      transactions: [{ ...coffee, currency: "USD" }],
    },
    "repeated-charges-foreign",
  );
  expect((await alice.imports.get({ id: foreign })).rows[0]?.matchStatus).toBe(
    "new",
  );
  expect(
    await alice.imports.commit({
      jobId: foreign,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ transactions: 1 });
});

test("excluded identical charges do not prevent a later import from adding the missing occurrence", async () => {
  const account = await alice.accounts.create({
    name: "Excluded repeated charge",
    type: "checking",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const out = {
    ...base,
    transactions: [
      line("2026-09-18", "COFFEE", -5),
      line("2026-09-18", "COFFEE", -5),
    ],
  };
  const first = await stagedJob(
    { ...account, type: "checking" },
    out,
    "excluded-charge-first",
  );
  const [excluded] = (await alice.imports.get({ id: first })).rows;
  await alice.imports.updateRows({
    jobId: first,
    ids: [excluded!.id],
    decision: "skip",
  });
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const second = await stagedJob(
    { ...account, type: "checking" },
    out,
    "excluded-charge-second",
  );
  expect(
    await alice.imports.commit({
      jobId: second,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ transactions: 1, duplicates: 0 });
  expect(
    await db.$count(
      schema.transaction,
      eq(schema.transaction.accountId, account.id),
    ),
  ).toBe(2);
});

test("statements reviewed before another import saves still deduplicate at commit", async () => {
  const account = await alice.accounts.create({
    name: "Pending overlaps",
    type: "checking",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const out = {
    ...base,
    transactions: [
      line("2026-09-19", "COFFEE", -5),
      line("2026-09-19", "COFFEE", -5),
    ],
  };
  const first = await stagedJob(
    { ...account, type: "checking" },
    out,
    "pending-overlap-first",
  );
  const second = await stagedJob(
    { ...account, type: "checking" },
    out,
    "pending-overlap-second",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-10-01",
    acknowledgeBalanceMismatch: true,
  });
  expect(
    await alice.imports.commit({
      jobId: second,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ transactions: 0, duplicates: 2 });
  expect(
    await db.$count(
      schema.transaction,
      eq(schema.transaction.accountId, account.id),
    ),
  ).toBe(2);
});

test("overlapping trades distinguish symbols and currencies even without linked holdings", async () => {
  const account = await alice.accounts.create({
    name: "Distinct overlapping trades",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const trade = (symbol: string, currency = "SGD") => ({
    reference: null,
    type: "buy" as const,
    tradeDate: "2026-09-15",
    settleDate: null,
    symbol,
    quantity: 1,
    price: 100,
    amount: -100,
    fees: 0,
    currency,
    description: `Bought ${symbol}`,
  });
  const first = await stagedJob(
    { ...account, type: "brokerage" },
    { ...base, investmentTransactions: [trade("AAPL")] },
    "distinct-trades-newer",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-10-01",
    acknowledgeBalanceMismatch: true,
  });
  const out = {
    ...base,
    investmentTransactions: [
      trade("MSFT"),
      trade("AAPL", "USD"),
      trade("AAPL"),
    ],
  };
  const older = await stagedJob(
    { ...account, type: "brokerage" },
    out,
    "distinct-trades-older",
  );
  expect(
    (await alice.imports.get({ id: older })).rows.map((r) => [
      r.matchStatus,
      r.decision,
    ]),
  ).toEqual([
    ["new", "accept"],
    ["new", "accept"],
    ["duplicate", "skip"],
  ]);
  expect(
    await alice.imports.commit({
      jobId: older,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ activity: 2 });
  const replay = await stagedJob(
    { ...account, type: "brokerage" },
    out,
    "distinct-trades-again",
  );
  expect(
    (await alice.imports.get({ id: replay })).rows.map((r) => r.matchStatus),
  ).toEqual(["duplicate", "duplicate", "duplicate"]);
  await alice.imports.commit({
    jobId: replay,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  expect(
    await db.$count(
      schema.investmentTransaction,
      eq(schema.investmentTransaction.accountId, account.id),
    ),
  ).toBe(3);
  // An additional identical trade must also get its own occurrence at commit.
  const repeated = await stagedJob(
    { ...account, type: "brokerage" },
    { ...base, investmentTransactions: [trade("AAPL"), trade("AAPL")] },
    "distinct-trades-repeated",
  );
  expect(
    await alice.imports.commit({
      jobId: repeated,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ activity: 1, duplicates: 0 });
  expect(
    await db.$count(
      schema.investmentTransaction,
      eq(schema.investmentTransaction.accountId, account.id),
    ),
  ).toBe(4);
});

test("trades link to the listing the account holds, never a same-symbol listing in another currency", async () => {
  const account = await alice.accounts.create({
    name: "Trade broker",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  // An old typo and two same-currency listings the statement cannot tell apart.
  await db.insert(schema.security).values([
    { symbol: "D05", exchange: "XSES", currency: "USD", assetClass: "stock" },
    { symbol: "AMB", exchange: "XSES", currency: "SGD", assetClass: "stock" },
    { symbol: "AMB", exchange: "", currency: "SGD", assetClass: "stock" },
  ]);
  const trade = (symbol: string) => ({
    reference: null,
    type: "buy" as const,
    tradeDate: "2026-09-15",
    settleDate: null,
    symbol,
    quantity: 10,
    price: 39,
    amount: -390,
    fees: null,
    currency: "SGD",
    description: `Bought ${symbol}`,
  });
  const jobId = await stagedJob(
    { id: account.id, type: "brokerage" },
    {
      ...base,
      documentType: "brokerage_statement",
      positions: [
        {
          symbol: "D05",
          exchange: "XSES",
          name: "DBS Group Holdings",
          assetClass: "stock",
          quantity: 10,
          averageCost: 39,
          marketPrice: 39.2,
          marketValue: 392,
          currency: "SGD",
        },
      ],
      investmentTransactions: [trade("D05"), trade("AMB")],
    },
    "trade-listings",
  );
  await alice.imports.commit({
    jobId,
    asOf: "2026-09-30",
  });
  const linked = await db
    .select({
      description: schema.investmentTransaction.description,
      currency: schema.security.currency,
    })
    .from(schema.investmentTransaction)
    .leftJoin(
      schema.security,
      eq(schema.security.id, schema.investmentTransaction.securityId),
    )
    .where(eq(schema.investmentTransaction.accountId, account.id))
    .orderBy(schema.investmentTransaction.description);
  expect(linked).toEqual([
    { description: "Bought AMB", currency: null },
    { description: "Bought D05", currency: "SGD" },
  ]);
});

test("a back-dated statement links trades to its own listings, not a newer entry's", async () => {
  const portfolio = portfolioRouter.createCaller(contextFor("alice"));
  const account = await alice.accounts.create({
    name: "Back-dated broker",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const listed = (symbol: string, exchange: string) => ({
    symbol,
    exchange,
    name: "",
    assetClass: "stock" as const,
    currency: "SGD",
    quantity: "10",
    averageCost: null,
    price: "5",
    value: null,
  });
  // July and October were entered by hand; October left the exchange blank.
  for (const [asOf, exchange] of [
    ["2026-07-31", "XSES"],
    ["2026-10-15", ""],
  ] as const)
    await portfolio.addSnapshot({
      accountId: account.id,
      asOf,
      positions: [listed("C38U", exchange), listed("O39", exchange)],
      cash: [],
    });
  const trade = (symbol: string) => ({
    reference: null,
    type: "sell" as const,
    tradeDate: "2026-08-14",
    settleDate: null,
    symbol,
    quantity: -10,
    price: 5,
    amount: 50,
    fees: null,
    currency: "SGD",
    description: `Sold ${symbol}`,
  });
  // August still holds C38U on SGX; O39 was sold, so only July says where it traded.
  const jobId = await stagedJob(
    { id: account.id, type: "brokerage" },
    {
      ...base,
      documentType: "brokerage_statement",
      positions: [
        {
          symbol: "C38U",
          exchange: "XSES",
          name: null,
          assetClass: "stock",
          quantity: 10,
          averageCost: null,
          marketPrice: 5,
          marketValue: 50,
          currency: "SGD",
        },
      ],
      investmentTransactions: [trade("C38U"), trade("O39")],
    },
    "back-dated-trades",
  );
  await alice.imports.commit({
    jobId,
    asOf: "2026-08-31",
  });
  const linked = await db
    .select({
      description: schema.investmentTransaction.description,
      exchange: schema.security.exchange,
    })
    .from(schema.investmentTransaction)
    .leftJoin(
      schema.security,
      eq(schema.security.id, schema.investmentTransaction.securityId),
    )
    .where(eq(schema.investmentTransaction.accountId, account.id))
    .orderBy(schema.investmentTransaction.description);
  expect(linked).toEqual([
    { description: "Sold C38U", exchange: "XSES" },
    { description: "Sold O39", exchange: "XSES" },
  ]);
});

async function removableBroker(name: string) {
  const account = await alice.accounts.create({
    name,
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const jobId = await stagedJob(
    { id: account.id, type: "brokerage" },
    {
      ...base,
      documentType: "brokerage_statement",
      positions: [
        {
          symbol: "ROWTEST",
          exchange: "XSES",
          name: "Example holding",
          assetClass: "stock",
          quantity: 10,
          averageCost: 2,
          marketPrice: 3,
          marketValue: 31,
          currency: "SGD",
        },
      ],
      cashBalances: [{ currency: "SGD", amount: 5, bucket: null }],
      investmentTransactions: [
        {
          reference: null,
          type: "buy",
          tradeDate: "2026-09-15",
          settleDate: null,
          symbol: "ROWTEST",
          quantity: 10,
          price: 2,
          amount: -20,
          fees: null,
          currency: "SGD",
          description: "Example buy",
        },
      ],
    },
    name,
  );
  await alice.imports.commit({
    jobId,
    asOf: "2026-09-30",
  });
  const job = await alice.imports.get({ id: jobId });
  return {
    account,
    job,
    jobId,
    positionRow: job.rows.find((r) => r.kind === "position")!,
    cashRow: job.rows.find((r) => r.kind === "cash_balance")!,
    tradeRow: job.rows.find((r) => r.kind === "investment_transaction")!,
  };
}

describe("removing individual imported rows", () => {
  test("removes only the selected holding, retains evidence, invalidates stale entry edits, and handles the last balance", async () => {
    const { account, jobId, job, positionRow, cashRow, tradeRow } =
      await removableBroker("remove-one-position");
    const portfolio = portfolioRouter.createCaller(contextFor("alice"));
    await portfolio.addSnapshot({
      accountId: account.id,
      asOf: "2026-08-31",
      positions: [],
      cash: [{ currency: "SGD", amount: "1" }],
    });
    const detail = await portfolio.snapshot({
      accountId: account.id,
      snapshotId: positionRow.committedRecordId!,
    });
    const before = await alice.imports.lineRemovalPreview({
      jobId,
      rowId: positionRow.id,
    });
    expect(before).toMatchObject({
      label: "ROWTEST · XSES",
      lastInSnapshot: false,
    });
    expect(before.effect).toContain("current dated entry");
    await expect(
      bob.imports.lineRemovalPreview({ jobId, rowId: positionRow.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      bob.imports.removeLine({
        jobId,
        rowId: positionRow.id,
        version: before.version,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await alice.imports.removeLine({
      jobId,
      rowId: positionRow.id,
      version: before.version,
    });
    const holdings = (await alice.accounts.get(account)).holdings!;
    expect(holdings.positions).toEqual([]);
    expect(holdings.cash).toHaveLength(1);
    expect(
      await db
        .select()
        .from(schema.investmentTransaction)
        .where(
          eq(schema.investmentTransaction.id, tradeRow.committedRecordId!),
        ),
    ).toHaveLength(1);
    const after = await alice.imports.get({ id: jobId });
    expect(after.rows.find((r) => r.id === positionRow.id)).toMatchObject({
      removed: true,
      decision: "skip",
      data: positionRow.data,
      committedRecordId: positionRow.committedRecordId,
    });
    expect(after.rows.find((r) => r.id === cashRow.id)?.removed).toBe(false);
    expect(after.documentId).toBe(job.documentId);
    expect(
      (
        await db
          .select()
          .from(schema.extractionJob)
          .where(eq(schema.extractionJob.id, jobId))
      )[0]!.result,
    ).toMatchObject({ positions: [{ symbol: "ROWTEST", quantity: 10 }] });
    const audit = (
      await db
        .select()
        .from(schema.auditLog)
        .where(eq(schema.auditLog.targetId, positionRow.id))
    )[0]!;
    expect(audit.details).toEqual({
      jobId,
      accountId: account.id,
      kind: "position",
      recordId: before.targetId,
    });
    await expect(
      portfolio.removeSnapshot({
        accountId: account.id,
        snapshotId: detail.id,
        version: detail.version,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      alice.imports.removeLine({
        jobId,
        rowId: positionRow.id,
        version: before.version,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const last = await alice.imports.lineRemovalPreview({
      jobId,
      rowId: cashRow.id,
    });
    expect(last.lastInSnapshot).toBe(true);
    expect(last.effect).toContain("last row");
    await alice.imports.removeLine({
      jobId,
      rowId: cashRow.id,
      version: last.version,
    });
    expect((await alice.accounts.get(account)).holdings!.asOf).toBe(
      "2026-08-31",
    );
    expect(
      await db
        .select()
        .from(schema.accountSnapshot)
        .where(eq(schema.accountSnapshot.id, detail.id)),
    ).toHaveLength(0);
  });

  test("trade deletion leaves holdings intact; cross-import row IDs and stale reviews are rejected", async () => {
    const a = await removableBroker("remove-one-trade");
    const b = await removableBroker("remove-other-import");
    await expect(
      alice.imports.lineRemovalPreview({
        jobId: a.jobId,
        rowId: b.tradeRow.id,
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const review = await alice.imports.lineRemovalPreview({
      jobId: a.jobId,
      rowId: a.tradeRow.id,
    });
    expect(review.effect).toContain("Holdings and cash balances are unchanged");
    await db
      .update(schema.investmentTransaction)
      .set({ amount: "-21" })
      .where(
        eq(schema.investmentTransaction.id, a.tradeRow.committedRecordId!),
      );
    await expect(
      alice.imports.removeLine({
        jobId: a.jobId,
        rowId: a.tradeRow.id,
        version: review.version,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const fresh = await alice.imports.lineRemovalPreview({
      jobId: a.jobId,
      rowId: a.tradeRow.id,
    });
    expect(fresh.facts).toContainEqual({
      label: "Amount",
      value: "SGD -21.0000",
    });
    await alice.imports.removeLine({
      jobId: a.jobId,
      rowId: a.tradeRow.id,
      version: fresh.version,
    });
    expect(
      await db
        .select()
        .from(schema.investmentTransaction)
        .where(
          eq(schema.investmentTransaction.id, a.tradeRow.committedRecordId!),
        ),
    ).toHaveLength(0);
    expect(
      (await alice.accounts.get(a.account)).holdings!.positions,
    ).toHaveLength(1);
    expect((await alice.accounts.get(a.account)).holdings!.cash).toHaveLength(
      1,
    );
    expect(
      (await alice.imports.get({ id: b.jobId })).rows.every((r) => !r.removed),
    ).toBe(true);
  });

  test("requires a new review when snapshot contents or the current entry change; edited holdings are managed in history", async () => {
    const a = await removableBroker("remove-stale-holding");
    const review = await alice.imports.lineRemovalPreview({
      jobId: a.jobId,
      rowId: a.positionRow.id,
    });
    const cashReview = await alice.imports.lineRemovalPreview({
      jobId: a.jobId,
      rowId: a.cashRow.id,
    });
    await alice.imports.removeLine({
      jobId: a.jobId,
      rowId: a.cashRow.id,
      version: cashReview.version,
    });
    await expect(
      alice.imports.removeLine({
        jobId: a.jobId,
        rowId: a.positionRow.id,
        version: review.version,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const next = await alice.imports.lineRemovalPreview({
      jobId: a.jobId,
      rowId: a.positionRow.id,
    });
    const portfolio = portfolioRouter.createCaller(contextFor("alice"));
    await portfolio.addSnapshot({
      accountId: a.account.id,
      asOf: "2026-10-01",
      positions: [],
      cash: [{ currency: "SGD", amount: "100" }],
    });
    await expect(
      alice.imports.removeLine({
        jobId: a.jobId,
        rowId: a.positionRow.id,
        version: next.version,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const historical = await alice.imports.lineRemovalPreview({
      jobId: a.jobId,
      rowId: a.positionRow.id,
    });
    expect(historical.effect).toContain("historical entry");
    await alice.imports.removeLine({
      jobId: a.jobId,
      rowId: a.positionRow.id,
      version: historical.version,
    });
    expect((await alice.accounts.get(a.account)).holdings!.asOf).toBe(
      "2026-10-01",
    );
    const b = await removableBroker("remove-edited-holding");
    await db
      .update(schema.position)
      .set({ quantity: "99" })
      .where(eq(schema.position.snapshotId, b.positionRow.committedRecordId!));
    await expect(
      alice.imports.lineRemovalPreview({
        jobId: b.jobId,
        rowId: b.positionRow.id,
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await db
      .update(schema.financialAccount)
      .set({ archivedAt: new Date() })
      .where(eq(schema.financialAccount.id, b.account.id));
    await expect(
      alice.imports.lineRemovalPreview({ jobId: b.jobId, rowId: b.cashRow.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  test("bank rows respect reconciliation and never delete a duplicate's original or the saved balance", async () => {
    const account = await alice.accounts.create({
      name: "Remove bank row",
      type: "checking",
      institutionId: null,
      currency: "SGD",
      last4: "",
      notes: "",
    });
    const first = await stagedJob(
      { id: account.id, type: "checking" },
      {
        ...base,
        transactions: [
          line("2026-09-10", "Example debit", -10),
          line("2026-09-11", "Example credit", 20),
        ],
      },
      "remove-bank-lines",
    );
    await alice.imports.commit({
      jobId: first,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    });
    const job = await alice.imports.get({ id: first });
    const row = job.rows.find((r) => r.kind === "transaction")!;
    const review = await alice.imports.lineRemovalPreview({
      jobId: first,
      rowId: row.id,
    });
    const second = await stagedJob(
      { id: account.id, type: "checking" },
      { ...base, transactions: [line("2026-09-10", "Example debit", -10)] },
      "remove-bank-duplicate",
    );
    await alice.imports.commit({
      jobId: second,
      asOf: "2026-10-01",
      acknowledgeBalanceMismatch: true,
    });
    const duplicate = (await alice.imports.get({ id: second })).rows.find(
      (r) => r.kind === "transaction",
    )!;
    expect(duplicate.committedRecordId).toBeNull();
    await expect(
      alice.imports.lineRemovalPreview({ jobId: second, rowId: duplicate.id }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const [reconciliation] = await db
      .insert(schema.accountReconciliation)
      .values({
        ownerId: "alice",
        accountId: account.id,
        currency: "SGD",
        startDate: "2026-09-01",
        endDate: "2026-09-30",
        openingBalance: "0",
        closingBalance: "10",
      })
      .returning();
    await expect(
      alice.imports.removeLine({
        jobId: first,
        rowId: row.id,
        version: review.version,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await db
      .delete(schema.accountReconciliation)
      .where(eq(schema.accountReconciliation.id, reconciliation!.id));
    await alice.imports.removeLine({
      jobId: first,
      rowId: row.id,
      version: review.version,
    });
    expect(
      await db
        .select()
        .from(schema.transaction)
        .where(eq(schema.transaction.accountId, account.id)),
    ).toHaveLength(1);
    expect((await alice.accounts.get(account)).holdings!.cash).toHaveLength(1);
  });

  test("CPF statements save each sub-account; balances without a closing total are kept", async () => {
    const account = await alice.accounts.create({
      name: "Imported CPF",
      type: "cpf",
      institutionId: null,
      currency: "SGD",
      last4: "",
      notes: "",
    });
    const sub = (bucket: "oa" | "sa" | "ma", amount: number) => ({
      currency: "SGD",
      amount,
      bucket,
    });
    const jobId = await stagedJob(
      { id: account.id, type: "cpf" },
      {
        ...base,
        closingBalance: null,
        cashBalances: [sub("oa", 300), sub("sa", 200), sub("ma", 100)],
      },
      "cpf-buckets",
    );
    const rows = (await alice.imports.get({ id: jobId })).rows;
    expect(rows.map((r) => [r.kind, r.data])).toEqual([
      [
        "cash_balance",
        stagedSchemas.cash_balance.parse({
          currency: "SGD",
          amount: "300",
          bucket: "oa",
        }),
      ],
      [
        "cash_balance",
        stagedSchemas.cash_balance.parse({
          currency: "SGD",
          amount: "200",
          bucket: "sa",
        }),
      ],
      [
        "cash_balance",
        stagedSchemas.cash_balance.parse({
          currency: "SGD",
          amount: "100",
          bucket: "ma",
        }),
      ],
    ]);
    await alice.imports.commit({
      jobId,
      asOf: "2026-09-30",
    });
    expect(
      (await alice.accounts.get(account))
        .holdings!.cash.map((c) => `${c.bucket} ${c.amount}`)
        .sort(),
    ).toEqual(["ma 100.0000", "oa 300.0000", "sa 200.0000"]);
    const removal = await alice.imports.lineRemovalPreview({
      jobId,
      rowId: rows[1]!.id,
    });
    expect(removal.label).toBe("Special SGD");

    // A bank statement that lists balances but prints no closing total keeps them.
    const bank = await alice.accounts.create({
      name: "Balances only",
      type: "checking",
      institutionId: null,
      currency: "SGD",
      last4: "",
      notes: "",
    });
    const bankJob = await stagedJob(
      { id: bank.id, type: "checking" },
      { ...base, closingBalance: null, cashBalances: [sub("oa", 42)] },
      "bank-balances-only",
    );
    expect(
      (await alice.imports.get({ id: bankJob })).rows.map((r) => r.data),
    ).toEqual([
      stagedSchemas.cash_balance.parse({
        currency: "SGD",
        amount: "42",
        bucket: null,
      }),
    ]);
  });
});

test("archiving and re-adding a broker preserves the original import and offers restoration, never silently reattaching it", async () => {
  const original = await removableBroker("reintroduced-broker");
  const input = { jobId: original.jobId, rowId: original.cashRow.id };
  const review = await alice.imports.lineRemovalPreview(input);
  expect(await alice.accounts.remove({ id: original.account.id })).toEqual({
    outcome: "archived",
  });
  const replacement = await alice.accounts.create({
    name: "reintroduced-broker",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  expect(replacement.id).not.toBe(original.account.id);
  const job = await alice.imports.get({ id: original.jobId });
  expect(job.accountId).toBe(original.account.id);
  expect(job.accountArchivedAt).toBeInstanceOf(Date);
  expect(
    (await alice.imports.list()).find((j) => j.id === original.jobId)
      ?.accountArchivedAt,
  ).toBeInstanceOf(Date);
  await expect(alice.imports.lineRemovalPreview(input)).rejects.toThrow(
    "Restore the original account",
  );
  await expect(
    alice.imports.removeLine({ ...input, version: review.version }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
  await expect(
    bob.accounts.restore({ id: original.account.id }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  expect((await alice.accounts.get(replacement)).holdings).toBeNull();
  expect(
    (await alice.accounts.get(original.account)).holdings!.positions,
  ).toHaveLength(1);
  await alice.accounts.restore({ id: original.account.id });
  expect(
    (await alice.imports.get({ id: original.jobId })).accountArchivedAt,
  ).toBeNull();
  const restored = await alice.imports.lineRemovalPreview(input);
  await alice.imports.removeLine({ ...input, version: restored.version });
  expect(
    (await alice.accounts.get(original.account)).holdings!.positions,
  ).toHaveLength(1);
  expect(
    (await alice.accounts.get(original.account)).holdings!.cash,
  ).toHaveLength(0);
  expect((await alice.accounts.get(replacement)).holdings).toBeNull();
});

test("an orphaned import reports its deleted source account without attaching to a newly created broker", async () => {
  const original = await removableBroker("orphaned-import");
  // Legacy or administrative deletion of the source sets document.account_id to null.
  await db
    .delete(schema.financialAccount)
    .where(eq(schema.financialAccount.id, original.account.id));
  const job = await alice.imports.get({ id: original.jobId });
  expect(job.accountId).toBeNull();
  expect(job.rows).toHaveLength(3);
  await expect(
    alice.imports.lineRemovalPreview({
      jobId: original.jobId,
      rowId: original.cashRow.id,
    }),
  ).rejects.toThrow("The original account was deleted");
  await expect(
    alice.imports.removeLine({
      jobId: original.jobId,
      rowId: original.cashRow.id,
      version: "a".repeat(64),
    }),
  ).rejects.toThrow("The original account was deleted");
});

test("staging derives transfers from LLM categories and merchant rules, including inherited kinds", async () => {
  const account = await alice.accounts.create({
    name: "Transfer staging",
    type: "checking",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const [parent] = await db
    .insert(schema.category)
    .values({ key: "transfer-stage", name: "Transfers", kind: "transfer" })
    .returning();
  const [child] = await db
    .insert(schema.category)
    .values({
      key: "transfer-stage.child",
      name: "Brokerage funding",
      parentId: parent!.id,
    })
    .returning();
  await db.insert(schema.merchantRule).values({
    ownerId: "alice",
    pattern: "broker funding",
    categoryId: child!.id,
  });
  const jobId = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      transactions: [
        line("2026-09-10", "LLM funding", -100, "transfer-stage.child"),
        line("2026-09-11", "Broker funding", -200),
        {
          ...line("2026-09-12", "Expense correction", -5, "groceries"),
          isTransfer: true,
        },
      ],
    },
    "transfer-stage",
  );
  const rows = (await alice.imports.get({ id: jobId })).rows.filter(
    (r) => r.kind === "transaction",
  );
  expect(rows.map((r) => [r.data.categoryId, r.data.isTransfer])).toEqual([
    [child!.id, true],
    [child!.id, true],
    [groceriesId, false],
  ]);

  await alice.imports.updateRows({
    jobId,
    ids: [rows[0]!.id],
    patch: { categoryId: groceriesId },
  });
  let updated = (await alice.imports.get({ id: jobId })).rows.find(
    (r) => r.id === rows[0]!.id,
  )!;
  expect(updated.data).toMatchObject({
    categoryId: groceriesId,
    isTransfer: false,
  });
  await alice.imports.updateRows({
    jobId,
    ids: [rows[0]!.id],
    patch: { isTransfer: true },
  });
  updated = (await alice.imports.get({ id: jobId })).rows.find(
    (r) => r.id === rows[0]!.id,
  )!;
  expect(updated.data).toMatchObject({ categoryId: null, isTransfer: true });
  await alice.imports.updateRows({
    jobId,
    ids: [rows[0]!.id],
    patch: { categoryId: child!.id, isTransfer: false },
  });
  await alice.imports.updateRows({
    jobId,
    ids: [rows[1]!.id],
    patch: { isTransfer: false },
  });
  const reviewed = (await alice.imports.get({ id: jobId })).rows.filter(
    (r) => r.kind === "transaction",
  );
  expect(reviewed.map((r) => [r.data.categoryId, r.data.isTransfer])).toEqual([
    [child!.id, true],
    [null, false],
    [groceriesId, false],
  ]);

  // Older staged rows may predate the consistency fix; commit must derive the flag again.
  await db
    .update(schema.stagedRow)
    .set({ data: { ...reviewed[0]!.data, isTransfer: false } })
    .where(eq(schema.stagedRow.id, reviewed[0]!.id));
  await alice.imports.commit({
    jobId,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const saved = await db
    .select()
    .from(schema.transaction)
    .where(eq(schema.transaction.accountId, account.id));
  expect(saved.find((r) => r.description === "LLM funding")).toMatchObject({
    categoryId: child!.id,
    isTransfer: true,
    amount: "-100.0000",
  });
  expect(saved.find((r) => r.description === "Broker funding")).toMatchObject({
    categoryId: null,
    isTransfer: false,
  });
});

test("bank references decide matches and keep distinct identical charges at commit", async () => {
  const account = await alice.accounts.create({
    name: "Bank references",
    type: "checking",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const charge = { ...line("2026-09-15", "COFFEE", -5), reference: "bank-A" };
  const first = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      closingBalance: null,
      transactions: [charge],
    },
    "bank-reference-first",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
  });
  const second = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      closingBalance: null,
      transactions: [
        { ...charge, reference: "bank-B" },
        {
          ...charge,
          description: "Changed text",
        },
      ],
    },
    "bank-reference-second",
  );
  expect(
    (await alice.imports.get({ id: second })).rows.map((r) => [
      r.matchStatus,
      r.decision,
    ]),
  ).toEqual([
    ["new", "accept"],
    ["duplicate", "skip"],
  ]);
  expect(
    await alice.imports.commit({
      jobId: second,
      asOf: "2026-09-30",
    }),
  ).toMatchObject({ transactions: 1 });
  const saved = await db
    .select()
    .from(schema.transaction)
    .where(eq(schema.transaction.accountId, account.id));
  expect(saved.map((r) => r.reference).sort()).toEqual(["bank-A", "bank-B"]);
  const fallback = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      closingBalance: null,
      transactions: [
        { ...charge, reference: null },
        { ...charge, reference: null, description: "Other coffee shop" },
      ],
    },
    "bank-reference-fallback",
  );
  const rows = (await alice.imports.get({ id: fallback })).rows;
  expect(rows.map((r) => [r.matchStatus, r.decision])).toEqual([
    ["duplicate", "skip"],
    ["possible_duplicate", "pending"],
  ]);
  await alice.imports.updateRows({
    jobId: fallback,
    ids: [rows[1]!.id],
    decision: "skip",
  });
  expect(
    await alice.imports.commit({
      jobId: fallback,
      asOf: "2026-09-30",
    }),
  ).toMatchObject({ transactions: 0 });
});

test("recurring bank references keep later payments and stay bounded per row", async () => {
  const account = await alice.accounts.create({
    name: "Recurring GIRO",
    type: "checking",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const charge = {
    ...line("2026-09-15", "GIRO payment", -50),
    reference: "GIRO",
  };
  const out = { ...base, closingBalance: null, transactions: [charge] };
  const first = await stagedJob(
    { ...account, type: "checking" },
    out,
    "recurring-giro-first",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
  });
  const later = await stagedJob(
    { ...account, type: "checking" },
    { ...out, transactions: [{ ...charge, date: "2026-10-15" }] },
    "recurring-giro-later",
  );
  expect((await alice.imports.get({ id: later })).rows[0]).toMatchObject({
    matchStatus: "new",
    decision: "accept",
  });
  expect(
    await alice.imports.commit({
      jobId: later,
      asOf: "2026-10-31",
    }),
  ).toMatchObject({ transactions: 1, duplicates: 0 });
  const wide = await stagedJob(
    { ...account, type: "checking" },
    {
      ...out,
      transactions: [{ ...charge, date: "2026-11-15" }, charge],
    },
    "recurring-giro-wide",
  );
  expect(
    (await alice.imports.get({ id: wide })).rows.map((r) => [
      r.matchStatus,
      r.decision,
    ]),
  ).toEqual([
    ["new", "accept"],
    ["duplicate", "skip"],
  ]);
  const saved = await db
    .select()
    .from(schema.transaction)
    .where(eq(schema.transaction.accountId, account.id));
  expect(saved).toHaveLength(2);
  expect(new Set(saved.map((r) => r.fingerprint)).size).toBe(2);
});

test("same bank references with changed core fields require review only within three days", async () => {
  const account = await alice.accounts.create({
    name: "Amended GIRO",
    type: "checking",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const charge = {
    ...line("2026-09-15", "GIRO payment", -50),
    reference: "GIRO",
  };
  const out = { ...base, closingBalance: null, transactions: [charge] };
  const first = await stagedJob(
    { ...account, type: "checking" },
    out,
    "amended-giro-first",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
  });
  const variants = [
    { ...charge, amount: -60 },
    { ...charge, currency: "USD" },
    { ...charge, date: "2026-09-12" },
    { ...charge, date: "2026-09-18" },
  ];
  for (const [i, variant] of variants.entries()) {
    const jobId = await stagedJob(
      { ...account, type: "checking" },
      { ...out, transactions: [variant] },
      `amended-giro-${i}`,
    );
    const row = (await alice.imports.get({ id: jobId })).rows[0]!;
    expect(row).toMatchObject({
      matchStatus: "possible_duplicate",
      decision: "pending",
    });
    await expect(
      alice.imports.commit({
        jobId,
        asOf: "2026-09-30",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    if (i === 0) {
      await alice.imports.updateRows({
        jobId,
        ids: [row.id],
        decision: "accept",
      });
      expect(
        await alice.imports.commit({
          jobId,
          asOf: "2026-09-30",
        }),
      ).toMatchObject({ transactions: 1, duplicates: 0 });
    }
  }
  for (const date of ["2026-09-11", "2026-09-19"]) {
    const jobId = await stagedJob(
      { ...account, type: "checking" },
      { ...out, transactions: [{ ...charge, date }] },
      `giro-outside-window-${date}`,
    );
    expect((await alice.imports.get({ id: jobId })).rows[0]).toMatchObject({
      matchStatus: "new",
      decision: "accept",
    });
  }
});

test("trade quantities, prices and fees distinguish otherwise identical trades through commit", async () => {
  const account = await alice.accounts.create({
    name: "Trade details",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const trade = tradeLine();
  const first = await stagedJob(
    { ...account, type: "brokerage" },
    {
      ...base,
      investmentTransactions: [trade],
    },
    "trade-details-first",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const variants = [
    { ...trade, quantity: 1 },
    { ...trade, price: 51 },
    { ...trade, fees: 2 },
  ];
  const out = { ...base, investmentTransactions: [...variants, trade] };
  const second = await stagedJob(
    { ...account, type: "brokerage" },
    out,
    "trade-details-second",
  );
  expect(
    (await alice.imports.get({ id: second })).rows.map((r) => r.matchStatus),
  ).toEqual(["new", "new", "new", "duplicate"]);
  expect(
    await alice.imports.commit({
      jobId: second,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ activity: 3 });
  const replay = await stagedJob(
    { ...account, type: "brokerage" },
    out,
    "trade-details-replay",
  );
  expect(
    (await alice.imports.get({ id: replay })).rows.map((r) => r.matchStatus),
  ).toEqual(["duplicate", "duplicate", "duplicate", "duplicate"]);
  for (const field of ["quantity", "price", "fees"] as const) {
    const unknown = await stagedJob(
      { ...account, type: "brokerage" },
      {
        ...base,
        investmentTransactions: [{ ...trade, [field]: null }],
      },
      `trade-unknown-${field}`,
    );
    expect((await alice.imports.get({ id: unknown })).rows[0]).toMatchObject({
      matchStatus: "possible_duplicate",
      decision: "pending",
    });
    await expect(
      alice.imports.commit({
        jobId: unknown,
        asOf: "2026-09-30",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }
  expect(
    await db.$count(
      schema.investmentTransaction,
      eq(schema.investmentTransaction.accountId, account.id),
    ),
  ).toBe(4);
});

test("unknown trade details require decisions and Keep preserves repeated occurrences", async () => {
  const account = await alice.accounts.create({
    name: "Unknown trade details",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const trade = { ...tradeLine(), fees: null };
  const first = await stagedJob(
    { ...account, type: "brokerage" },
    {
      ...base,
      investmentTransactions: [trade],
    },
    "unknown-trade-first",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const repeated = await stagedJob(
    { ...account, type: "brokerage" },
    {
      ...base,
      investmentTransactions: [trade, trade],
    },
    "unknown-trade-repeated",
  );
  const rows = (await alice.imports.get({ id: repeated })).rows;
  expect(rows.map((r) => [r.matchStatus, r.decision])).toEqual([
    ["possible_duplicate", "pending"],
    ["new", "accept"],
  ]);
  await expect(
    alice.imports.commit({
      jobId: repeated,
      asOf: "2026-09-30",
    }),
  ).rejects.toMatchObject({
    code: "BAD_REQUEST",
    message: "Choose Keep or Skip for every possible duplicate before saving",
  });
  await alice.imports.updateRows({
    jobId: repeated,
    ids: [rows[0]!.id],
    decision: "accept",
  });
  expect(
    await alice.imports.commit({
      jobId: repeated,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ activity: 2, duplicates: 0 });
  const known = await stagedJob(
    { ...account, type: "brokerage" },
    {
      ...base,
      investmentTransactions: [tradeLine()],
    },
    "unknown-trade-existing",
  );
  const row = (await alice.imports.get({ id: known })).rows[0]!;
  expect(row).toMatchObject({
    matchStatus: "possible_duplicate",
    decision: "pending",
  });
  await alice.imports.updateRows({
    jobId: known,
    ids: [row.id],
    decision: "skip",
  });
  expect(
    await alice.imports.commit({
      jobId: known,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ activity: 0 });
  expect(
    await db.$count(
      schema.investmentTransaction,
      eq(schema.investmentTransaction.accountId, account.id),
    ),
  ).toBe(3);
});

test("trade references confirm matching details and distinguish equal cash amounts", async () => {
  const account = await alice.accounts.create({
    name: "Trade references",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const trade = { ...tradeLine(), fees: null, reference: "execution-A" };
  const first = await stagedJob(
    { ...account, type: "brokerage" },
    {
      ...base,
      investmentTransactions: [trade],
    },
    "trade-reference-first",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const second = await stagedJob(
    { ...account, type: "brokerage" },
    {
      ...base,
      investmentTransactions: [
        { ...trade, reference: "execution-B" },
        {
          ...trade,
          description: "Changed trade text",
        },
      ],
    },
    "trade-reference-second",
  );
  expect(
    (await alice.imports.get({ id: second })).rows.map((r) => [
      r.matchStatus,
      r.decision,
    ]),
  ).toEqual([
    ["new", "accept"],
    ["duplicate", "skip"],
  ]);
  expect(
    await alice.imports.commit({
      jobId: second,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).toMatchObject({ activity: 1 });
  const saved = await db
    .select()
    .from(schema.investmentTransaction)
    .where(eq(schema.investmentTransaction.accountId, account.id));
  expect(saved.map((r) => r.reference).sort()).toEqual([
    "execution-A",
    "execution-B",
  ]);
});

test("same trade references with changed core fields or details require review", async () => {
  const account = await alice.accounts.create({
    name: "Amended trade references",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const trade = { ...tradeLine(), reference: "execution-amended" };
  const out = { ...base, investmentTransactions: [trade] };
  const first = await stagedJob(
    { ...account, type: "brokerage" },
    out,
    "amended-trade-first",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const variants = [
    { ...trade, quantity: 3 },
    { ...trade, price: 51 },
    { ...trade, fees: 2 },
    { ...trade, amount: -102 },
    { ...trade, currency: "USD" },
    { ...trade, symbol: "OTHER" },
    { ...trade, type: "sell" as const },
    { ...trade, tradeDate: "2026-09-12" },
    { ...trade, tradeDate: "2026-09-18" },
  ];
  for (const [i, variant] of variants.entries()) {
    const jobId = await stagedJob(
      { ...account, type: "brokerage" },
      { ...out, investmentTransactions: [variant] },
      `amended-trade-${i}`,
    );
    const row = (await alice.imports.get({ id: jobId })).rows[0]!;
    expect(row).toMatchObject({
      matchStatus: "possible_duplicate",
      decision: "pending",
    });
    await expect(
      alice.imports.commit({
        jobId,
        asOf: "2026-09-30",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    if (i === 0) {
      await alice.imports.updateRows({
        jobId,
        ids: [row.id],
        decision: "accept",
      });
      expect(
        await alice.imports.commit({
          jobId,
          asOf: "2026-09-30",
          acknowledgeBalanceMismatch: true,
        }),
      ).toMatchObject({ activity: 1, duplicates: 0 });
    }
  }
  for (const tradeDate of ["2026-09-11", "2026-09-19", "2026-10-15"]) {
    const jobId = await stagedJob(
      { ...account, type: "brokerage" },
      { ...out, investmentTransactions: [{ ...trade, tradeDate }] },
      `trade-outside-window-${tradeDate}`,
    );
    expect((await alice.imports.get({ id: jobId })).rows[0]).toMatchObject({
      matchStatus: "new",
      decision: "accept",
    });
    if (tradeDate === "2026-10-15") {
      expect(
        await alice.imports.commit({
          jobId,
          asOf: "2026-10-31",
          acknowledgeBalanceMismatch: true,
        }),
      ).toMatchObject({ activity: 1, duplicates: 0 });
    }
  }
  const wide = await stagedJob(
    { ...account, type: "brokerage" },
    {
      ...out,
      investmentTransactions: [{ ...trade, tradeDate: "2026-11-15" }, trade],
    },
    "trade-reference-wide",
  );
  expect(
    (await alice.imports.get({ id: wide })).rows.map((r) => [
      r.matchStatus,
      r.decision,
    ]),
  ).toEqual([
    ["new", "accept"],
    ["duplicate", "skip"],
  ]);
});

test("confirmed trades take precedence over uncertain candidates without reusing records", async () => {
  const account = await alice.accounts.create({
    name: "Trade candidate order",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const trade = tradeLine();
  const unknown = { ...trade, fees: null };
  const first = await stagedJob(
    { ...account, type: "brokerage" },
    {
      ...base,
      investmentTransactions: [unknown, trade],
    },
    "trade-candidates-first",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const second = await stagedJob(
    { ...account, type: "brokerage" },
    {
      ...base,
      investmentTransactions: [trade, unknown, unknown],
    },
    "trade-candidates-second",
  );
  expect(
    (await alice.imports.get({ id: second })).rows.map((r) => [
      r.matchStatus,
      r.decision,
    ]),
  ).toEqual([
    ["duplicate", "skip"],
    ["possible_duplicate", "pending"],
    ["new", "accept"],
  ]);
});

test("the reference migration requires review of previously auto-accepted possible duplicates", async () => {
  const account = await alice.accounts.create({
    name: "Legacy duplicate review",
    type: "checking",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const jobId = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      transactions: [
        line("2026-09-01", "Coffee", -5),
        line("2026-09-02", "Coffee", -5),
      ],
    },
    "legacy-duplicate-review",
  );
  const rows = (await alice.imports.get({ id: jobId })).rows;
  await db
    .update(schema.stagedRow)
    .set({ matchStatus: "possible_duplicate", decision: "accept" })
    .where(eq(schema.stagedRow.id, rows[0]!.id));
  await db
    .update(schema.stagedRow)
    .set({ matchStatus: "possible_duplicate", decision: "skip" })
    .where(eq(schema.stagedRow.id, rows[1]!.id));
  const completed = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      transactions: [line("2026-09-03", "Coffee", -5)],
    },
    "legacy-completed-review",
  );
  await alice.imports.commit({
    jobId: completed,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const saved = (await alice.imports.get({ id: completed })).rows[0]!;
  await db
    .update(schema.stagedRow)
    .set({ matchStatus: "possible_duplicate" })
    .where(eq(schema.stagedRow.id, saved.id));
  const migration = await Bun.file(
    new URL("../drizzle/0014_flashy_squirrel_girl.sql", import.meta.url),
  ).text();
  await engine.exec(migration.split("--> statement-breakpoint").at(-1)!);
  expect(
    (await alice.imports.get({ id: jobId })).rows.map((r) => r.decision),
  ).toEqual(["pending", "skip", "accept"]);
  expect((await alice.imports.get({ id: completed })).rows[0]!.decision).toBe(
    "accept",
  );
  await expect(
    alice.imports.commit({
      jobId,
      asOf: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

test("printed direction and magnitude default for old imports and reject negative printed magnitudes", () => {
  const old = Object.fromEntries(
    Object.entries(base).filter(([key]) => !key.endsWith("BalanceDirection")),
  );
  const oldLine = Object.fromEntries(
    Object.entries(line("2026-09-01", "Old", -5)).filter(
      ([key]) => !key.startsWith("printed"),
    ),
  );
  const parsed = buildStatementSchema(["groceries"]).parse({
    ...old,
    transactions: [oldLine],
  });
  expect(parsed).toMatchObject({
    openingBalanceDirection: null,
    closingBalanceDirection: null,
  });
  expect(parsed.transactions[0]).toMatchObject({
    printedDirection: null,
    printedAmount: null,
  });
  expect(
    buildStatementSchema(["groceries"]).safeParse({
      ...old,
      transactions: [{ ...oldLine, printedAmount: -5 }],
    }).success,
  ).toBe(false);
  expect(
    stagedSchemas.transaction.parse({
      postedDate: "2026-09-01",
      transactionDate: null,
      description: "Old",
      merchant: null,
      amount: "-5",
      currency: "SGD",
      originalAmount: null,
      originalCurrency: null,
      categoryId: null,
      isTransfer: false,
    }),
  ).toMatchObject({
    printedDirection: null,
    printedAmount: null,
    signMismatch: false,
    suggestedAmount: null,
  });
  expect(
    stagedSchemas.cash_balance.parse({ amount: "-50", currency: "SGD" }),
  ).toMatchObject({
    amount: "-50",
    balanceDirection: null,
    openingBalance: null,
    openingBalanceDirection: null,
  });
});

test("bank, cash and card signs are checked against printed evidence without silently changing amounts", async () => {
  for (const type of ["checking", "cash", "credit_card"] as const) {
    const account = await alice.accounts.create({
      name: `Printed ${type}`,
      type,
      currency: "SGD",
      institutionId: null,
      last4: "",
      notes: "",
    });
    const jobId = await stagedJob(
      { ...account, type },
      {
        ...base,
        closingBalance: null,
        transactions: [
          {
            ...line("2026-09-01", "Wrong debit", 45),
            printedDirection: "debit",
            printedAmount: 45,
          },
          {
            ...line("2026-09-02", "Wrong credit", -45),
            printedDirection: "credit",
            printedAmount: 45,
          },
          {
            ...line("2026-09-03", "Wrong magnitude", -30),
            printedDirection: "debit",
            printedAmount: 45,
          },
          {
            ...line("2026-09-04", "Correct debit", -45),
            printedDirection: "debit",
            printedAmount: 45,
          },
          {
            ...line("2026-09-05", "Correct credit", 45),
            printedDirection: "credit",
            printedAmount: 45,
          },
          {
            ...line("2026-09-06", "Zero misread", 0),
            printedDirection: "credit",
            printedAmount: 45,
          },
          { ...line("2026-09-07", "Magnitude only", -30), printedAmount: 45 },
          line("2026-09-08", "No evidence", -5),
        ],
      },
      `evidence-${type}`,
    );
    const rows = (await alice.imports.get({ id: jobId })).rows;
    expect(
      rows
        .filter((r) => r.kind === "transaction")
        .map((r) => [
          r.data.amount,
          r.data.signMismatch,
          r.data.suggestedAmount,
        ]),
    ).toEqual([
      ["45", true, "-45"],
      ["-45", true, "45"],
      ["-30", true, "-45"],
      ["-45", false, null],
      ["45", false, null],
      ["0", true, "45"],
      ["-30", true, "-45"],
      ["-5", false, null],
    ]);
    expect(rows[1]!.data).toMatchObject({
      printedDirection: "credit",
      printedAmount: "45",
    });
    // Warnings are advisory: an explicit save may keep the extracted amounts unchanged.
    expect(
      await alice.imports.commit({
        jobId,
        asOf: "2026-09-30",
      }),
    ).toMatchObject({ transactions: 8 });
  }
});

test("review edits confirm evidence, clear incompatible categories and preserve transfer classification", async () => {
  const account = await alice.accounts.create({
    name: "Sign corrections",
    type: "checking",
    currency: "SGD",
    institutionId: null,
    last4: "",
    notes: "",
  });
  const [transfer, income] = await db
    .insert(schema.category)
    .values([
      { key: "sign-transfer", name: "Transfer", kind: "transfer" },
      { key: "sign-income", name: "Income", kind: "income" },
    ])
    .returning();
  const jobId = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      closingBalance: null,
      transactions: [
        {
          ...line("2026-09-01", "Refund", -45, "groceries"),
          printedDirection: "credit",
          printedAmount: 45,
        },
        {
          ...line("2026-09-02", "Transfer correction", -45, "sign-transfer"),
          printedDirection: "credit",
          printedAmount: 45,
        },
        {
          ...line("2026-09-03", "Income correction", 45, "sign-income"),
          printedDirection: "debit",
          printedAmount: 45,
        },
        {
          ...line("2026-09-04", "Confirm extraction", -45, "groceries"),
          printedDirection: "credit",
          printedAmount: 45,
        },
      ],
    },
    "sign-corrections",
  );
  const rows = (await alice.imports.get({ id: jobId })).rows;
  await expect(
    bob.imports.updateRows({
      jobId,
      ids: [rows[0]!.id],
      patch: { amount: "45" },
    }),
  ).rejects.toMatchObject({ code: "NOT_FOUND" });
  for (const amount of [
    "NaN",
    "Infinity",
    "1e3",
    "1.12345",
    "10000000000000000",
  ]) {
    await expect(
      alice.imports.updateRows({
        jobId,
        ids: [rows[0]!.id],
        patch: { amount },
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  }
  await alice.imports.updateRows({
    jobId,
    ids: [rows[0]!.id],
    patch: { merchant: "A refund" },
  });
  expect((await alice.imports.get({ id: jobId })).rows[0]!.data).toMatchObject({
    signMismatch: true,
  });
  await alice.imports.updateRows({
    jobId,
    ids: rows.slice(0, 2).map((r) => r.id),
    patch: { amount: "45" },
  });
  await alice.imports.updateRows({
    jobId,
    ids: [rows[2]!.id],
    patch: { amount: "-45" },
  });
  await alice.imports.updateRows({
    jobId,
    ids: [rows[3]!.id],
    patch: { confirmAmount: true },
  });
  const corrected = (await alice.imports.get({ id: jobId })).rows;
  expect(corrected[0]!.data).toMatchObject({
    amount: "45",
    categoryId: null,
    isTransfer: false,
    signMismatch: false,
    suggestedAmount: null,
    printedDirection: "credit",
    printedAmount: "45",
  });
  expect(corrected[1]!.data).toMatchObject({
    amount: "45",
    categoryId: transfer!.id,
    isTransfer: true,
    signMismatch: false,
  });
  expect(corrected[2]!.data).toMatchObject({
    amount: "-45",
    categoryId: null,
    isTransfer: false,
    signMismatch: false,
  });
  expect(corrected[3]!.data).toMatchObject({
    amount: "-45",
    categoryId: groceriesId,
    signMismatch: false,
    suggestedAmount: null,
  });
  expect(income!.kind).toBe("income");
  await alice.imports.commit({
    jobId,
    asOf: "2026-09-30",
  });
  const saved = await db
    .select()
    .from(schema.transaction)
    .where(eq(schema.transaction.accountId, account.id));
  expect(saved.find((t) => t.description === "Refund")).toMatchObject({
    amount: "45.0000",
    categoryId: null,
    isTransfer: false,
  });
  expect(
    saved.find((t) => t.description === "Transfer correction"),
  ).toMatchObject({
    amount: "45.0000",
    categoryId: transfer!.id,
    isTransfer: true,
  });
  await expect(
    alice.imports.updateRows({
      jobId,
      ids: [rows[0]!.id],
      patch: { amount: "-45" },
    }),
  ).rejects.toMatchObject({ code: "CONFLICT" });
});

test("card opening and closing debt is negative, CR overpayments positive, and bank/broker negative cash survives", async () => {
  const cases = [
    { direction: "owed", printed: 50 },
    { direction: "credit", printed: 50 },
    { direction: null, printed: 50 },
    { direction: null, printed: -50 },
    { direction: "credit", printed: -50 },
  ] as const;
  for (const [i, { direction, printed }] of cases.entries()) {
    const account = await alice.accounts.create({
      name: `Card balance ${i}`,
      type: "credit_card",
      currency: "SGD",
      institutionId: null,
      last4: "",
      notes: "",
    });
    const jobId = await stagedJob(
      { ...account, type: "credit_card" },
      {
        ...base,
        openingBalance: 100,
        closingBalance: printed,
        openingBalanceDirection: direction,
        closingBalanceDirection: direction,
      },
      `card-balance-${i}`,
    );
    const row = (await alice.imports.get({ id: jobId })).rows[0]!;
    expect(row.data).toMatchObject({
      amount: direction === "credit" ? "50" : "-50",
      openingBalance: direction === "credit" ? "100" : "-100",
      balanceDirection: direction,
      openingBalanceDirection: direction,
    });
    await alice.imports.commit({
      jobId,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    });
    expect((await alice.accounts.get(account)).holdings!.cash[0]!.amount).toBe(
      direction === "credit" ? "50.0000" : "-50.0000",
    );
  }
  for (const type of ["checking", "brokerage"] as const) {
    const account = await alice.accounts.create({
      name: `Negative ${type}`,
      type,
      currency: "SGD",
      institutionId: null,
      last4: "",
      notes: "",
    });
    const jobId = await stagedJob(
      { ...account, type },
      {
        ...base,
        openingBalance: -100,
        closingBalance: -50,
        cashBalances: [{ currency: "SGD", amount: -50, bucket: null }],
      },
      `negative-balance-${type}`,
    );
    expect(
      (await alice.imports.get({ id: jobId })).rows[0]!.data,
    ).toMatchObject({
      amount: "-50",
      openingBalance: type === "checking" ? "-100" : null,
    });
    await alice.imports.commit({
      jobId,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    });
    expect((await alice.accounts.get(account)).holdings!.cash[0]!.amount).toBe(
      "-50.0000",
    );
  }
});

test("edited closing cash and broker activity amounts commit with their chosen signs", async () => {
  for (const type of ["credit_card", "brokerage"] as const) {
    const account = await alice.accounts.create({
      name: `Editable ${type}`,
      type,
      currency: "SGD",
      institutionId: null,
      last4: "",
      notes: "",
    });
    const jobId = await stagedJob(
      { ...account, type },
      {
        ...base,
        closingBalance: 50,
        cashBalances: [{ currency: "SGD", amount: -50, bucket: null }],
        investmentTransactions: [tradeLine()],
      },
      `editable-amounts-${type}`,
    );
    const rows = (await alice.imports.get({ id: jobId })).rows;
    const balance = rows.find((r) => r.kind === "cash_balance")!;
    await alice.imports.updateRows({
      jobId,
      ids: [balance.id],
      patch: { amount: "12.3456" },
    });
    const activity = rows.find((r) => r.kind === "investment_transaction");
    if (activity)
      await alice.imports.updateRows({
        jobId,
        ids: [activity.id],
        patch: { amount: "102.1234" },
      });
    await alice.imports.commit({
      jobId,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    });
    expect((await alice.accounts.get(account)).holdings!.cash[0]!.amount).toBe(
      "12.3456",
    );
    if (activity)
      expect(
        (
          await db
            .select()
            .from(schema.investmentTransaction)
            .where(eq(schema.investmentTransaction.accountId, account.id))
        )[0]!.amount,
      ).toBe("102.1234");
  }
});

test("correcting an exact duplicate amount requires a fresh decision and fingerprints the corrected value", async () => {
  const account = await alice.accounts.create({
    name: "Correct duplicate sign",
    type: "checking",
    currency: "SGD",
    institutionId: null,
    last4: "",
    notes: "",
  });
  const out = {
    ...base,
    closingBalance: null,
    transactions: [line("2026-09-01", "Correction", -45)],
  };
  const first = await stagedJob(
    { ...account, type: "checking" },
    out,
    "sign-first",
  );
  await alice.imports.commit({
    jobId: first,
    asOf: "2026-09-30",
  });
  const second = await stagedJob(
    { ...account, type: "checking" },
    out,
    "sign-second",
  );
  const row = (await alice.imports.get({ id: second })).rows[0]!;
  expect(row).toMatchObject({ matchStatus: "duplicate", decision: "skip" });
  await alice.imports.updateRows({
    jobId: second,
    ids: [row.id],
    patch: { amount: "45.0000" },
  });
  expect((await alice.imports.get({ id: second })).rows[0]).toMatchObject({
    matchStatus: "possible_duplicate",
    decision: "pending",
    data: { amount: "45" },
  });
  await expect(
    alice.imports.commit({
      jobId: second,
      asOf: "2026-09-30",
    }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await alice.imports.updateRows({
    jobId: second,
    ids: [row.id],
    decision: "accept",
  });
  expect(
    await alice.imports.commit({
      jobId: second,
      asOf: "2026-09-30",
    }),
  ).toMatchObject({ transactions: 1, duplicates: 0 });
  const replay = await stagedJob(
    { ...account, type: "checking" },
    { ...out, transactions: [{ ...out.transactions[0]!, amount: 45 }] },
    "sign-replay",
  );
  expect((await alice.imports.get({ id: replay })).rows[0]).toMatchObject({
    matchStatus: "duplicate",
    decision: "skip",
    data: { amount: "45" },
  });
});

const balanceLine = (
  id: string,
  amount: string,
  overrides: Partial<
    Parameters<typeof checkImportBalance>[0]["rows"][number]
  > = {},
) => ({
  id,
  kind: "transaction",
  decision: "accept",
  matchStatus: "new",
  data: { currency: "SGD", amount, description: id, postedDate: "2026-09-01" },
  ...overrides,
});
const balanceInput = (
  rows: Parameters<typeof checkImportBalance>[0]["rows"],
) => ({
  summary: { ...base, openingBalance: 100, closingBalance: 70 },
  accountType: "checking" as const,
  accountCurrency: "SGD",
  rows,
});

test("balance checks separate extraction from skipped gaps and include recorded duplicates", () => {
  const rows = [
    balanceLine("purchase", "-20"),
    balanceLine("exact", "-5", { decision: "skip", matchStatus: "duplicate" }),
    balanceLine("similar", "-5", {
      decision: "skip",
      matchStatus: "possible_duplicate",
    }),
    balanceLine("foreign", "-999", {
      data: { currency: "USD", amount: "-999" },
    }),
  ];
  const check = checkImportBalance(balanceInput(rows));
  expect(check.requiresAcknowledgment).toBe(false);
  expect(check.currencies[0]).toMatchObject({
    currency: "SGD",
    extraction: { total: "-30", difference: "0", balances: true },
    saved: { total: "-30", difference: "0", balances: true },
  });
  expect(check.currencies[1]).toMatchObject({
    currency: "USD",
    lineCount: 1,
    extraction: { difference: null },
  });
  const skipped = checkImportBalance(
    balanceInput([{ ...rows[0]!, decision: "skip" }, ...rows.slice(1)]),
  );
  expect(skipped.requiresAcknowledgment).toBe(true);
  expect(skipped.currencies[0]).toMatchObject({
    extraction: { balances: true },
    saved: { difference: "20", balances: false },
    skippedRows: [{ id: "purchase", amount: "-20" }],
    skippedTotal: "-20",
    skippedExplainDifference: true,
  });
  const missingRecord = checkImportBalance(
    balanceInput([rows[0]!, { ...rows[1]!, recorded: false }, rows[2]!]),
  );
  expect(missingRecord.currencies[0]!.saved.difference).toBe("5");
  const pending = checkImportBalance(
    balanceInput([...rows.slice(0, 2), { ...rows[2]!, decision: "pending" }]),
  );
  expect(pending.provisional).toBe(true);
  expect(pending.currencies[0]!.extraction.balances).toBe(true);
});

test("accepted exact duplicates use stored amounts and posting dates in saved balance checks", () => {
  for (const stored of [
    { postedDate: "2026-09-10", amount: "-20", expected: "-20" },
    { postedDate: "2026-08-31", amount: "-30", expected: "0" },
    { postedDate: "2026-10-01", amount: "-30", expected: "0" },
  ]) {
    const check = checkImportBalance(
      balanceInput([
        balanceLine("matched", "-30", {
          matchStatus: "duplicate",
          recorded: true,
          recordedTransaction: { ...stored, currency: "SGD" },
        }),
      ]),
    );
    expect(check.currencies[0]!.extraction.balances).toBe(true);
    expect(check.currencies[0]!.saved.total).toBe(stored.expected);
    expect(check.requiresAcknowledgment).toBe(true);
  }
});

test("balance checks use decimal precision, per-currency pairs, and include empty statements", () => {
  const input = balanceInput([
    balanceLine("sgd", "-30"),
    balanceLine("usd", "-10", { data: { currency: "USD", amount: "-10" } }),
    balanceLine("usd-balances", "40", {
      kind: "cash_balance",
      data: { currency: "USD", openingBalance: "50", amount: "40" },
    }),
  ]);
  expect(
    checkImportBalance(input).currencies.every((c) => c.saved.balances),
  ).toBe(true);
  const decimal = checkImportBalance({
    ...balanceInput([balanceLine("decimal", "0.2")]),
    summary: { ...base, openingBalance: 0.1, closingBalance: 0.3 },
  });
  expect(decimal.requiresAcknowledgment).toBe(false);
  expect(
    checkImportBalance({
      ...balanceInput([balanceLine("precision", "-30.0001")]),
    }).currencies[0]!.extraction.difference,
  ).toBe("-0.0001");
  expect(checkImportBalance(balanceInput([])).requiresAcknowledgment).toBe(
    true,
  );
  expect(
    checkImportBalance({
      ...balanceInput([]),
      summary: { ...base, openingBalance: 100, closingBalance: 100 },
    }).requiresAcknowledgment,
  ).toBe(false);
});

test("card balance checks share debt/CR normalization and preserve corrected staged balances", () => {
  for (const direction of ["owed", "credit", null] as const) {
    const credit = direction === "credit";
    const input = {
      ...balanceInput([balanceLine("card", credit ? "50" : "-50")]),
      accountType: "credit_card" as const,
      summary: {
        ...base,
        documentType: "card_statement",
        openingBalance: 100,
        closingBalance: 150,
        openingBalanceDirection: direction,
        closingBalanceDirection: direction,
      },
    };
    const check = checkImportBalance(input);
    expect(check.openingBalance).toBe(credit ? "100" : "-100");
    expect(check.closingBalance).toBe(credit ? "150" : "-150");
    expect(check.requiresAcknowledgment).toBe(false);
    const corrected = checkImportBalance({
      ...input,
      rows: [
        balanceLine("payment", "120"),
        balanceLine("closing", "20", {
          kind: "cash_balance",
          data: { currency: "SGD", amount: "20", openingBalance: "-100" },
        }),
      ],
    });
    expect(corrected.requiresAcknowledgment).toBe(false);
    expect(corrected.closingBalance).toBe("20");
  }
});

test("partial statements never require balance acknowledgment", () => {
  const input = balanceInput([balanceLine("gap", "-5")]);
  for (const summary of [
    null,
    { ...input.summary, openingBalance: null },
    { ...input.summary, closingBalance: null },
    { ...input.summary, periodStart: null },
    { ...input.summary, periodEnd: null },
    { ...input.summary, documentType: "screenshot" },
    { ...input.summary, documentType: "trade_confirmation" },
  ]) {
    const check = checkImportBalance({ ...input, summary });
    expect(check.complete).toBe(false);
    expect(check.requiresAcknowledgment).toBe(false);
  }
});

async function balanceReview(
  out: Partial<StatementExtraction>,
  name: string,
  type: "checking" | "credit_card" = "checking",
) {
  const account = await alice.accounts.create({
    name,
    type,
    currency: "SGD",
    institutionId: null,
    last4: "",
    notes: "",
  });
  const jobId = await stagedJob(
    { ...account, type },
    {
      ...base,
      openingBalance: 100,
      closingBalance: 70,
      transactions: [
        line("2026-09-10", "Purchase", -20),
        line("2026-09-11", "Fee", -10),
      ],
      ...out,
    },
    name,
  );
  return { account, jobId };
}

test("complete mismatches require explicit acknowledgment and persist the checked totals", async () => {
  const { account, jobId } = await balanceReview(
    { closingBalance: 60 },
    "balance-ack",
  );
  await expect(
    alice.imports.commit({ jobId, asOf: "2026-09-30" }),
  ).rejects.toThrow("The statement balance check does not match.");
  expect(
    await db.$count(
      schema.transaction,
      eq(schema.transaction.accountId, account.id),
    ),
  ).toBe(0);
  expect((await alice.imports.get({ id: jobId })).status).toBe("needs_review");
  await alice.imports.commit({
    jobId,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const job = await alice.imports.get({ id: jobId });
  expect(job.summary?.balanceAcknowledgment?.acknowledgedAt).toBeString();
  const [saved] = await db
    .select()
    .from(schema.extractionJob)
    .where(eq(schema.extractionJob.id, jobId));
  expect(saved!.result).toMatchObject({
    openingBalance: 100,
    closingBalance: 60,
    balanceAcknowledgment: {
      check: {
        currencies: [
          { extraction: { difference: "10" }, saved: { difference: "10" } },
        ],
      },
    },
  });
});

test("server balance checks use corrections and require acknowledgment for nonduplicate skips", async () => {
  const { jobId } = await balanceReview({}, "balance-skip");
  const job = await alice.imports.get({ id: jobId });
  const purchase = job.rows.find((r) => r.kind === "transaction")!;
  await alice.imports.updateRows({
    jobId,
    ids: [purchase.id],
    decision: "skip",
  });
  await expect(
    alice.imports.commit({ jobId, asOf: "2026-09-30" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await alice.imports.updateRows({
    jobId,
    ids: [purchase.id],
    decision: "accept",
    patch: { amount: "-25" },
  });
  await expect(
    alice.imports.commit({ jobId, asOf: "2026-09-30" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  await alice.imports.updateRows({
    jobId,
    ids: [purchase.id],
    patch: { amount: "-20" },
  });
  await alice.imports.commit({ jobId, asOf: "2026-09-30" });
  expect(
    (await alice.imports.get({ id: jobId })).summary?.balanceAcknowledgment,
  ).toBeUndefined();
});

test("server checks include exact and decided duplicate skips but block pending choices", async () => {
  const { account, jobId } = await balanceReview({}, "balance-duplicate-first");
  await alice.imports.commit({ jobId, asOf: "2026-09-30" });
  const out = {
    ...base,
    openingBalance: 100,
    closingBalance: 70,
    transactions: [
      line("2026-09-10", "Purchase", -20),
      line("2026-09-11", "Changed fee description", -10),
    ],
  };
  const next = await stagedJob(
    { ...account, type: "checking" },
    out,
    "balance-duplicate-next",
  );
  const pending = await alice.imports.get({ id: next });
  const similar = pending.rows.find(
    (r) => r.matchStatus === "possible_duplicate",
  )!;
  expect(similar.decision).toBe("pending");
  await expect(
    alice.imports.commit({
      jobId: next,
      asOf: "2026-09-30",
      acknowledgeBalanceMismatch: true,
    }),
  ).rejects.toMatchObject({
    message: "Choose Keep or Skip for every possible duplicate before saving",
  });
  await alice.imports.updateRows({
    jobId: next,
    ids: [similar.id],
    decision: "skip",
  });
  const review = await alice.imports.get({ id: next });
  expect(
    checkImportBalance({
      summary: review.summary,
      accountType: review.accountType,
      accountCurrency: review.accountCurrency,
      rows: review.rows,
    }).requiresAcknowledgment,
  ).toBe(false);
  expect(
    await alice.imports.commit({ jobId: next, asOf: "2026-09-30" }),
  ).toMatchObject({ transactions: 0, balances: 1 });
});

test("skipping a corrected duplicate checks the stored amount and requires acknowledgment", async () => {
  const payment = line("2026-09-10", "Existing payment", -20);
  const { account, jobId } = await balanceReview(
    { closingBalance: 80, transactions: [payment] },
    "balance-stored-original",
  );
  await alice.imports.commit({ jobId, asOf: "2026-09-30" });
  const next = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      openingBalance: 100,
      closingBalance: 70,
      transactions: [payment],
    },
    "balance-stored-correction",
  );
  const row = (await alice.imports.get({ id: next })).rows.find(
    (r) => r.kind === "transaction",
  )!;
  await alice.imports.updateRows({
    jobId: next,
    ids: [row.id],
    patch: { amount: "-30" },
    decision: "skip",
  });
  const review = await alice.imports.get({ id: next });
  const check = checkImportBalance({
    summary: review.summary,
    accountType: review.accountType,
    accountCurrency: review.accountCurrency,
    rows: review.rows,
  });
  expect(check.currencies[0]).toMatchObject({
    extraction: { total: "-30", balances: true },
    saved: { total: "-20", difference: "10", balances: false },
  });
  expect(check.requiresAcknowledgment).toBe(true);
  await expect(
    alice.imports.commit({ jobId: next, asOf: "2026-09-30" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  expect((await alice.imports.get({ id: next })).status).toBe("needs_review");
  await alice.imports.commit({
    jobId: next,
    asOf: "2026-09-30",
    acknowledgeBalanceMismatch: true,
  });
  const saved = await db
    .select()
    .from(schema.transaction)
    .where(eq(schema.transaction.accountId, account.id));
  expect(saved.map((r) => r.amount)).toEqual(["-20.0000"]);
  expect(
    (await alice.imports.get({ id: next })).summary?.balanceAcknowledgment,
  ).toBeDefined();
});

test("skipped reference matches retain their stored currency in balance checks", async () => {
  const payment = {
    ...line("2026-09-10", "Referenced payment", -20),
    reference: "balance-currency-reference",
    currency: "USD",
  };
  const { account, jobId } = await balanceReview(
    { closingBalance: null, transactions: [payment] },
    "balance-stored-currency-original",
  );
  await alice.imports.commit({ jobId, asOf: "2026-09-30" });
  const next = await stagedJob(
    { ...account, type: "checking" },
    {
      ...base,
      openingBalance: 100,
      closingBalance: 70,
      transactions: [{ ...payment, amount: -30, currency: "SGD" }],
    },
    "balance-stored-currency-next",
  );
  const row = (await alice.imports.get({ id: next })).rows.find(
    (r) => r.kind === "transaction",
  )!;
  expect(row.matchStatus).toBe("possible_duplicate");
  await alice.imports.updateRows({
    jobId: next,
    ids: [row.id],
    decision: "skip",
  });
  const review = await alice.imports.get({ id: next });
  const check = checkImportBalance({
    summary: review.summary,
    accountType: review.accountType,
    accountCurrency: review.accountCurrency,
    rows: review.rows,
  });
  expect(check.currencies).toMatchObject([
    {
      currency: "SGD",
      extraction: { total: "-30", balances: true },
      saved: { total: "0", difference: "30", balances: false },
    },
    { currency: "USD", saved: { total: "-20", difference: null } },
  ]);
  await expect(
    alice.imports.commit({ jobId: next, asOf: "2026-09-30" }),
  ).rejects.toMatchObject({ code: "BAD_REQUEST" });
});

test("server checks sign-normalized card statements and partial imports without acknowledgment", async () => {
  const { jobId } = await balanceReview(
    {
      documentType: "card_statement",
      openingBalance: 100,
      closingBalance: 20,
      openingBalanceDirection: "owed",
      closingBalanceDirection: "credit",
      transactions: [line("2026-09-10", "Payment", 120)],
    },
    "balance-card-credit",
    "credit_card",
  );
  await alice.imports.commit({ jobId, asOf: "2026-09-30" });
  for (const [i, out] of [
    { openingBalance: null },
    { closingBalance: null },
    { periodStart: null },
    { periodEnd: null },
    { documentType: "screenshot" as const },
  ].entries()) {
    const { jobId: partial } = await balanceReview(out, `balance-partial-${i}`);
    await alice.imports.commit({ jobId: partial, asOf: "2026-09-30" });
  }
});

test("separate statement imports leave transfers unmatched until both sides exist, then suggest without synthesizing entries", async () => {
  const source = await alice.accounts.create({
    name: "Transfer import bank",
    type: "checking",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const target = await alice.accounts.create({
    name: "Transfer import broker",
    type: "brokerage",
    institutionId: null,
    currency: "SGD",
    last4: "",
    notes: "",
  });
  const transfers = transfersRouter.createCaller(contextFor("alice"));
  const bankJob = await stagedJob(
    { id: source.id, type: "checking" },
    {
      ...base,
      openingBalance: null,
      closingBalance: null,
      transactions: [
        { ...line("2026-09-23", "Broker funding", -1234.56), isTransfer: true },
      ],
    },
    "transfer-bank",
  );
  await alice.imports.commit({ jobId: bankJob, asOf: "2026-09-30" });
  const first = await transfers.list();
  const outgoing = first.unmatched.find((s) => s.accountId === source.id)!;
  expect(outgoing.direction).toBe("out");
  expect(
    await db.$count(
      schema.investmentTransaction,
      eq(schema.investmentTransaction.accountId, target.id),
    ),
  ).toBe(0);
  const brokerJob = await stagedJob(
    { id: target.id, type: "brokerage" },
    {
      ...base,
      documentType: "brokerage_statement",
      openingBalance: null,
      closingBalance: null,
      investmentTransactions: [
        {
          ...tradeLine(),
          type: "deposit",
          symbol: null,
          quantity: null,
          price: null,
          amount: 1234.56,
          fees: null,
          tradeDate: "2026-09-25",
          description: "Bank funding",
        },
      ],
    },
    "transfer-broker",
  );
  await alice.imports.commit({ jobId: brokerJob, asOf: "2026-09-30" });
  const review = await transfers.list();
  const suggestion = review.suggestions.find(
    (s) => s.outgoing.id === outgoing.id,
  )!;
  expect(suggestion.incoming.accountId).toBe(target.id);
  expect(review.links.some((s) => s.outgoing?.id === outgoing.id)).toBe(false);
  await transfers.link({
    outgoing: suggestion.outgoing,
    incoming: suggestion.incoming,
  });
  expect(
    await db.$count(
      schema.transaction,
      eq(schema.transaction.accountId, source.id),
    ),
  ).toBe(1);
  expect(
    await db.$count(
      schema.investmentTransaction,
      eq(schema.investmentTransaction.accountId, target.id),
    ),
  ).toBe(1);
  expect(
    (await transfers.list()).links.some((s) => s.outgoing?.id === outgoing.id),
  ).toBe(true);
});
