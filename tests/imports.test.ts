import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";

import type { Database } from "../src/server/db";
import * as schema from "../src/server/db/schema";
import type { StatementExtraction } from "../src/server/modules/extraction/schemas";

const engine = new PGlite();
const db = drizzle(engine, { schema });
await mock.module("server-only", () => ({}));
await mock.module("~/server/db", () => ({ db }));
await mock.module("~/server/auth/config", () => ({
  auth: { api: { getSession: async () => null } },
}));
const { accountsRouter } = await import("../src/server/api/routers/accounts");
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
  closingBalance: 7370.15,
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
) => ({
  date,
  postedDate: null,
  description,
  merchant: null,
  amount,
  currency: "SGD",
  originalAmount: null,
  originalCurrency: null,
  categoryKey,
  isTransfer: false,
});

/** A document and job as the upload route creates them, staged from a canned extraction. */
async function stagedJob(
  account: { id: string; type: "checking" | "brokerage" | "cpf" },
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
    await alice.imports.commit({ jobId, asOf: "2026-09-30" });
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
    await alice.imports.commit({ jobId: olderJob, asOf: "2026-08-31" });
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
      ["transaction", "possible_duplicate", "accept"],
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

    expect(
      await alice.imports.commit({ jobId, asOf: "2026-09-30" }),
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
      alice.imports.commit({ jobId, asOf: "2026-09-30" }),
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
      await alice.imports.commit({ jobId, asOf: "2026-10-16" }),
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
  await alice.imports.commit({ jobId: newer, asOf: "2026-10-01" });
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
    await alice.imports.commit({ jobId: older, asOf: "2026-09-30" }),
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
    await alice.imports.commit({ jobId: repeated, asOf: "2026-09-30" }),
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
    await alice.imports.commit({ jobId: foreign, asOf: "2026-09-30" }),
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
  await alice.imports.commit({ jobId: first, asOf: "2026-09-30" });
  const second = await stagedJob(
    { ...account, type: "checking" },
    out,
    "excluded-charge-second",
  );
  expect(
    await alice.imports.commit({ jobId: second, asOf: "2026-09-30" }),
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
  await alice.imports.commit({ jobId: first, asOf: "2026-10-01" });
  expect(
    await alice.imports.commit({ jobId: second, asOf: "2026-09-30" }),
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
    type: "buy" as const,
    tradeDate: "2026-09-15",
    settleDate: null,
    symbol,
    quantity: 1,
    price: 100,
    amount: -100,
    fees: null,
    currency,
    description: `Bought ${symbol}`,
  });
  const first = await stagedJob(
    { ...account, type: "brokerage" },
    { ...base, investmentTransactions: [trade("AAPL")] },
    "distinct-trades-newer",
  );
  await alice.imports.commit({ jobId: first, asOf: "2026-10-01" });
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
    await alice.imports.commit({ jobId: older, asOf: "2026-09-30" }),
  ).toMatchObject({ activity: 2 });
  const replay = await stagedJob(
    { ...account, type: "brokerage" },
    out,
    "distinct-trades-again",
  );
  expect(
    (await alice.imports.get({ id: replay })).rows.map((r) => r.matchStatus),
  ).toEqual(["duplicate", "duplicate", "duplicate"]);
  await alice.imports.commit({ jobId: replay, asOf: "2026-09-30" });
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
    await alice.imports.commit({ jobId: repeated, asOf: "2026-09-30" }),
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
  await alice.imports.commit({ jobId, asOf: "2026-09-30" });
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
  await alice.imports.commit({ jobId, asOf: "2026-08-31" });
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
  await alice.imports.commit({ jobId, asOf: "2026-09-30" });
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
    await alice.imports.commit({ jobId: first, asOf: "2026-09-30" });
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
    await alice.imports.commit({ jobId: second, asOf: "2026-10-01" });
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
      ["cash_balance", { currency: "SGD", amount: "300", bucket: "oa" }],
      ["cash_balance", { currency: "SGD", amount: "200", bucket: "sa" }],
      ["cash_balance", { currency: "SGD", amount: "100", bucket: "ma" }],
    ]);
    await alice.imports.commit({ jobId, asOf: "2026-09-30" });
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
    ).toEqual([{ currency: "SGD", amount: "42", bucket: null }]);
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
