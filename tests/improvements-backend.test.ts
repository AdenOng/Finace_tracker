import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

import type { Database } from "../src/server/db";
import * as schema from "../src/server/db/schema";

const engine = new PGlite();
const db = drizzle(engine, { schema });
await mock.module("server-only", () => ({}));
await mock.module("~/server/db", () => ({ db }));
await mock.module("~/server/auth/config", () => ({
  auth: { api: { getSession: async () => null } },
}));

const { accountsRouter } = await import("../src/server/api/routers/accounts");
const { importsRouter } = await import("../src/server/api/routers/imports");
const { spendingRouter } = await import("../src/server/api/routers/spending");
const { createTRPCRouter } = await import("../src/server/api/trpc");
const { reseedFromActivePack } = await import("../src/server/db/seed/defaults");
const { getImportAvailability, invalidateImportAvailability } =
  await import("../src/server/modules/llm/routing");

const router = createTRPCRouter({
  accounts: accountsRouter,
  imports: importsRouter,
  spending: spendingRouter,
});

function callerFor(id: string) {
  return router.createCaller({
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
        name: `User ${id}`,
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
  });
}

beforeAll(async () => {
  const dir = path.resolve(process.cwd(), "drizzle");
  for (const file of readdirSync(dir)
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await engine.exec(readFileSync(path.join(dir, file), "utf8"));
  }
  await reseedFromActivePack(db as unknown as Database);
  await db.insert(schema.user).values({
    id: "alice",
    name: "Alice",
    email: "alice@example.com",
    emailVerified: true,
  });
});

afterAll(async () => {
  await engine.close();
});

test("spending.list parent-category filter includes child categories and uncategorised filter isolates non-transfers", async () => {
  const alice = callerFor("alice");
  const account = await alice.accounts.create({
    name: "Card",
    type: "credit_card",
    currency: "SGD",
    institutionId: null,
    last4: null,
    notes: null,
  });

  const [food] = await db
    .select()
    .from(schema.category)
    .where(eq(schema.category.name, "Food & Dining"))
    .limit(1);
  const [cafes] = await db
    .select()
    .from(schema.category)
    .where(eq(schema.category.name, "Cafes & Coffee"))
    .limit(1);
  const [transport] = await db
    .select()
    .from(schema.category)
    .where(eq(schema.category.name, "Transport"))
    .limit(1);

  await alice.spending.create({
    accountId: account.id,
    postedDate: "2026-11-05",
    description: "Bakery",
    merchant: null,
    amount: "-12.50",
    currency: "SGD",
    categoryId: cafes!.id,
    isTransfer: false,
    cleared: false,
    notes: null,
  });
  await alice.spending.create({
    accountId: account.id,
    postedDate: "2026-11-06",
    description: "MRT",
    merchant: null,
    amount: "-4.20",
    currency: "SGD",
    categoryId: transport!.id,
    isTransfer: false,
    cleared: false,
    notes: null,
  });
  await alice.spending.create({
    accountId: account.id,
    postedDate: "2026-11-07",
    description: "Misc cash",
    merchant: null,
    amount: "-20.00",
    currency: "SGD",
    categoryId: null,
    isTransfer: false,
    cleared: false,
    notes: null,
  });
  await alice.spending.create({
    accountId: account.id,
    postedDate: "2026-11-08",
    description: "Card payment",
    merchant: null,
    amount: "100.00",
    currency: "SGD",
    categoryId: null,
    isTransfer: true,
    cleared: false,
    notes: null,
  });

  const parentMatches = await alice.spending.list({
    month: "2026-11",
    accountId: null,
    categoryId: food!.id,
    search: "",
    limit: 50,
  });
  expect(parentMatches.map((r) => r.description)).toEqual(["Bakery"]);

  const uncatMatches = await alice.spending.list({
    month: "2026-11",
    accountId: null,
    categoryId: null,
    uncategorised: true,
    search: "",
    limit: 50,
  });
  expect(uncatMatches.map((r) => r.description)).toEqual(["Misc cash"]);
});

test("getImportAvailability coalesces concurrent probes, caches within TTL, and resets on invalidation", async () => {
  let selectCalls = 0;
  const baseDb = db as unknown as Database;
  const countingDb = Object.assign(
    Object.create(Object.getPrototypeOf(baseDb) as object) as Database,
    baseDb,
    {
      select: ((...args: Parameters<Database["select"]>) => {
        selectCalls += 1;
        return baseDb.select(...args);
      }) as Database["select"],
    },
  );

  const [first, second] = await Promise.all([
    getImportAvailability(countingDb),
    getImportAvailability(countingDb),
  ]);
  expect(first.available).toBe(false);
  expect(second).toEqual(first);
  const afterFirstBatch = selectCalls;
  expect(afterFirstBatch).toBeGreaterThan(0);

  const third = await getImportAvailability(countingDb);
  expect(third).toEqual(first);
  expect(selectCalls).toBe(afterFirstBatch);

  invalidateImportAvailability(countingDb);
  await getImportAvailability(countingDb);
  expect(selectCalls).toBeGreaterThan(afterFirstBatch);
});

test("imports.list returns page-local counts, zero for empty jobs, and owner-scoped cursor pages", async () => {
  await db.insert(schema.user).values({
    id: "other-import-owner",
    name: "Other owner",
    email: "other-import-owner@example.com",
    emailVerified: true,
  });
  const owner = "alice";
  const foreignOwner = "other-import-owner";
  const documents = await db
    .insert(schema.document)
    .values(
      Array.from({ length: 102 }, (_, i) => ({
        ownerId: i === 101 ? foreignOwner : owner,
        fileName: `statement-${i}.pdf`,
        mimeType: "application/pdf",
        sizeBytes: 100,
        sha256: `count-test-${i}`,
        storageKey: `statement-${i}.pdf`,
      })),
    )
    .returning({ id: schema.document.id, ownerId: schema.document.ownerId });
  const jobs = await db
    .insert(schema.extractionJob)
    .values(
      documents.map((document, i) => ({
        ownerId: document.ownerId,
        documentId: document.id,
        createdAt: new Date(Date.UTC(2026, 10, 1, 0, i)),
      })),
    )
    .returning({ id: schema.extractionJob.id });
  const newest = jobs[100]!;
  const oldest = jobs[0]!;
  await db.insert(schema.stagedRow).values([
    {
      jobId: newest.id,
      ownerId: owner,
      kind: "transaction",
      data: {},
      decision: "accept",
    },
    {
      jobId: newest.id,
      ownerId: owner,
      kind: "cash_balance",
      data: {},
      decision: "skip",
    },
    {
      jobId: oldest.id,
      ownerId: owner,
      kind: "transaction",
      data: {},
      decision: "pending",
    },
    {
      jobId: jobs[101]!.id,
      ownerId: foreignOwner,
      kind: "transaction",
      data: {},
      decision: "accept",
    },
  ]);

  const caller = callerFor(owner);
  const first = await caller.imports.list();
  expect(first).toHaveLength(100);
  expect(first[0]).toMatchObject({ id: newest.id, rows: 2, accepted: 1 });
  expect(first[1]).toMatchObject({ id: jobs[99]!.id, rows: 0, accepted: 0 });
  const last = first.at(-1)!;
  const second = await caller.imports.list({
    cursor: { createdAt: last.cursorCreatedAt, id: last.id },
  });
  expect(second).toHaveLength(1);
  expect(second[0]).toMatchObject({ id: oldest.id, rows: 1, accepted: 0 });
});
