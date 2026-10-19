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
  account: { id: string; type: "checking" | "brokerage" },
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
        cashBalances: [{ currency: "SGD", amount: 612.3 }],
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
  });
});
