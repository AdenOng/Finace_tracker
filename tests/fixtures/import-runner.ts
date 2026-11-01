import { mock } from "bun:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";

import type { Database } from "../../src/server/db";
import * as schema from "../../src/server/db/schema";
import type {
  LlmAdapter,
  LlmProviderConfig,
} from "../../src/server/modules/llm/types";

/**
 * Runs real import jobs against an in-memory database with fake AI providers. Each provider's
 * behaviour is picked by its model name. Lives in its own process (see import-runner.test.ts)
 * because it replaces the LLM and storage modules.
 */
const engine = new PGlite();
const db = drizzle(engine, { schema });
const journal = (await Bun.file(
  new URL("../../drizzle/meta/_journal.json", import.meta.url),
).json()) as { entries: { tag: string }[] };
for (const { tag } of journal.entries) {
  await engine.exec(
    await Bun.file(new URL(`../../drizzle/${tag}.sql`, import.meta.url)).text(),
  );
}

/** Models named "slow…" wait until released, so a test can control which read finishes first. */
const gates = new Map<
  string,
  { started: boolean; release: () => void; done: Promise<void> }
>();
function gate(model: string) {
  let release = () => undefined as void;
  const done = new Promise<void>((resolve) => (release = resolve));
  const entry = { started: false, release, done };
  gates.set(model, entry);
  return entry;
}
async function waitUntilStarted(model: string) {
  for (let i = 0; !gates.get(model)?.started; i++) {
    assert.ok(i < 300, `${model} never started`);
    await Bun.sleep(10);
  }
}

function fakeAdapter(config: LlmProviderConfig): LlmAdapter {
  return {
    listModels: async () => [],
    async generateStructured(request) {
      const model = config.defaultModel;
      if (model === "fails-with-usage")
        throw new llm.LlmError("Invalid structured response", {
          usage: { inputTokens: 73, outputTokens: 9 },
        });
      if (model === "fails") throw new Error("synthetic provider outage");
      const held = gates.get(model);
      if (held) {
        held.started = true;
        await held.done;
      }
      const output = request.schema.parse({
        documentType: "bank_statement",
        // Marks which run produced the result.
        institutionName: model,
        accountName: null,
        accountLast4: null,
        currency: "SGD",
        periodStart: null,
        periodEnd: null,
        openingBalance: model === "sign-evidence" ? 100 : null,
        openingBalanceDirection: model === "sign-evidence" ? "owed" : null,
        closingBalance: model === "sign-evidence" ? 50 : null,
        closingBalanceDirection: model === "sign-evidence" ? "credit" : null,
        transactions:
          model === "sign-evidence"
            ? [
                {
                  date: "2026-09-01",
                  postedDate: null,
                  description: "Card refund CR 45.00",
                  merchant: null,
                  amount: -45,
                  printedDirection: "credit",
                  printedAmount: 45,
                  currency: "SGD",
                  originalAmount: null,
                  originalCurrency: null,
                  categoryKey: null,
                  isTransfer: false,
                },
              ]
            : [],
        positions: [],
        cashBalances: [],
        investmentTransactions: [],
        warnings: [],
      });
      return { output, model, usage: { inputTokens: 100, outputTokens: 10 } };
    },
  };
}

await mock.module("server-only", () => ({}));
await mock.module("~/server/db", () => ({ db }));
const llm = await import("../../src/server/modules/llm");
await mock.module("~/server/modules/llm", () => ({
  ...llm,
  createLlmAdapter: fakeAdapter,
}));
let saveUploadCalls = 0;
await mock.module("~/server/modules/imports/storage", () => ({
  readUpload: async () => new Uint8Array([137, 80, 78, 71]),
  removeUpload: async () => undefined,
  saveUpload: async () => {
    saveUploadCalls++;
    return "unused";
  },
  sha256: () => "unused",
}));

const { isStaleJob, recoverImportJobs, runImportJob, staleJobCondition } =
  await import("../../src/server/modules/imports/runner");
const { monthlyTokenUsage } =
  await import("../../src/server/modules/llm/routing");
const { setCachedInstanceSettings, DEFAULT_INSTANCE_SETTINGS } =
  await import("../../src/server/lib/instance-settings-cache");

await db.insert(schema.user).values({
  id: "owner",
  name: "Example Owner",
  email: "owner@example.com",
});
await db.insert(schema.category).values({ key: "other", name: "Other" });
const [account] = await db
  .insert(schema.financialAccount)
  .values({ ownerId: "owner", name: "Savings", type: "savings" })
  .returning();

async function provider(
  name: string,
  values: Partial<typeof schema.llmProvider.$inferInsert> = {},
) {
  const [row] = await db
    .insert(schema.llmProvider)
    .values({
      name,
      kind: "openai_compatible",
      baseUrl: "http://localhost:4096/v1",
      defaultModel: name,
      ...values,
    })
    .returning();
  return row!;
}

async function job(mimeType = "image/png") {
  const [doc] = await db
    .insert(schema.document)
    .values({
      ownerId: "owner",
      accountId: account!.id,
      fileName: "statement.png",
      mimeType,
      sizeBytes: 4,
      sha256: crypto.randomUUID(),
      storageKey: "owner/statement.png",
    })
    .returning();
  const [row] = await db
    .insert(schema.extractionJob)
    .values({ ownerId: "owner", documentId: doc!.id })
    .returning();
  return row!;
}

const read = async (id: string) =>
  (
    await db
      .select()
      .from(schema.extractionJob)
      .where(eq(schema.extractionJob.id, id))
  )[0]!;
const resultOf = async (id: string) =>
  ((await read(id)).result as { institutionName: string } | null)
    ?.institutionName;
const setProviders = async (defaultId: string, fallbackId: string | null) => {
  await db
    .update(schema.llmProvider)
    .set({ isDefault: false })
    .where(eq(schema.llmProvider.isDefault, true));
  await db
    .update(schema.llmProvider)
    .set({ isDefault: true })
    .where(eq(schema.llmProvider.id, defaultId));
  setCachedInstanceSettings({
    ...DEFAULT_INSTANCE_SETTINGS,
    fallbackProviderId: fallbackId,
  });
};

// 1. A stopped read that finishes during its retry cannot overwrite the retry's result.
{
  const first = gate("slow-first");
  const retry = gate("slow-retry");
  const slow = await provider("slow-first");
  await setProviders(slow.id, null);
  const stopped = await job();
  const late = runImportJob(stopped.id);
  await waitUntilStarted("slow-first");

  // What Admin → Import jobs does: stop it, then retry (here with a different model).
  await db
    .update(schema.extractionJob)
    .set({ status: "failed", error: "Stopped by an admin." })
    .where(eq(schema.extractionJob.id, stopped.id));
  await db
    .update(schema.llmProvider)
    .set({ defaultModel: "slow-retry" })
    .where(eq(schema.llmProvider.id, slow.id));
  await db
    .update(schema.extractionJob)
    .set({ status: "queued" })
    .where(eq(schema.extractionJob.id, stopped.id));
  const retried = runImportJob(stopped.id);
  await waitUntilStarted("slow-retry");

  // The stopped read finishes while the retry is still running.
  first.release();
  await late;
  retry.release();
  await retried;
  const final = await read(stopped.id);
  assert.equal(final.status, "needs_review", final.error ?? "");
  assert.equal(final.attempts, 2);
  assert.equal(
    await resultOf(stopped.id),
    "slow-retry",
    "the stopped read overwrote its retry",
  );
}

// 2. An image read by a text-only default falls back to a provider that reads images.
const textOnly = await provider("text-only", { supportsVision: false });
const vision = await provider("vision");
{
  await setProviders(textOnly.id, vision.id);
  const scanned = await job();
  await runImportJob(scanned.id);
  const done = await read(scanned.id);
  assert.equal(done.status, "needs_review", done.error ?? "");
  assert.equal(done.providerId, vision.id);
  assert.equal(await resultOf(scanned.id), "vision");
}

// 3. A fallback whose key cannot be decrypted does not stop a working default.
const healthy = await provider("healthy");
const brokenKey = await provider("broken-key", {
  apiKeyEncrypted: "not-a-real-ciphertext",
});
{
  await setProviders(healthy.id, brokenKey.id);
  const ok = await job();
  await runImportJob(ok.id);
  assert.equal((await read(ok.id)).status, "needs_review");

  // When the default fails too, the job fails cleanly with both reasons.
  await db
    .update(schema.llmProvider)
    .set({ defaultModel: "fails" })
    .where(eq(schema.llmProvider.id, healthy.id));
  const failed = await job();
  await runImportJob(failed.id);
  const row = await read(failed.id);
  assert.equal(row.status, "failed");
  assert.match(row.error ?? "", /Fallback broken-key also failed/);
}

// 4. After a restart, an interrupted read fails (to be retried) and a lost queued read is run.
{
  const recovered = await provider("recovered");
  await setProviders(recovered.id, null);
  const minutesAgo = (minutes: number) =>
    new Date(Date.now() - minutes * 60_000);
  const interrupted = await job();
  await db
    .update(schema.extractionJob)
    .set({ status: "running", attempts: 1, startedAt: minutesAgo(7) })
    .where(eq(schema.extractionJob.id, interrupted.id));
  const lost = await job();
  await db
    .update(schema.extractionJob)
    .set({ updatedAt: minutesAgo(2) })
    .where(eq(schema.extractionJob.id, lost.id));
  // Just uploaded: its own request is about to read it.
  const fresh = await job();

  assert.deepEqual(await recoverImportJobs(), { interrupted: 1, started: 1 });
  const failed = await read(interrupted.id);
  assert.equal(failed.status, "failed");
  assert.match(failed.error ?? "", /server restarted/);
  assert.equal(failed.attempts, 1, "an interrupted read is not re-run");
  assert.equal((await read(lost.id)).status, "needs_review");
  assert.equal(await resultOf(lost.id), "recovered");
  const waiting = await read(fresh.id);
  assert.equal(waiting.status, "queued");

  // The owner sees a long-queued read as interrupted, and can read it again.
  assert.equal(isStaleJob(waiting), false);
  assert.equal(isStaleJob({ ...waiting, updatedAt: minutesAgo(7) }), true);
  assert.equal(
    isStaleJob({ ...failed, status: "running", startedAt: minutesAgo(1) }),
    false,
  );
}

// Printed evidence survives schema validation and the runner only stages data for review.
{
  const evidence = await provider("sign-evidence");
  await setProviders(evidence.id, null);
  await db
    .update(schema.financialAccount)
    .set({ type: "credit_card" })
    .where(eq(schema.financialAccount.id, account!.id));
  const imported = await job();
  await runImportJob(imported.id);
  const result = await read(imported.id);
  assert.equal(result.status, "needs_review", result.error ?? "");
  assert.equal(
    (result.result as { closingBalance: number }).closingBalance,
    50,
  );
  const rows = await db
    .select()
    .from(schema.stagedRow)
    .where(eq(schema.stagedRow.jobId, imported.id));
  const line = rows.find((r) => r.kind === "transaction")!.data;
  assert.equal(line.amount, "-45");
  assert.equal(line.printedDirection, "credit");
  assert.equal(line.printedAmount, "45");
  assert.equal(line.signMismatch, true);
  assert.equal(line.suggestedAmount, "45");
  const balance = rows.find((r) => r.kind === "cash_balance")!.data;
  assert.equal(balance.amount, "50");
  assert.equal(balance.openingBalance, "-100");
  assert.equal(balance.balanceDirection, "credit");
  assert.equal(await db.$count(schema.transaction), 0);
  assert.equal(await db.$count(schema.cashBalance), 0);
}

// Queue slots cap simultaneous extraction, and release the next read on completion.
{
  const held = gate("slow-queue");
  const queuedProvider = await provider("slow-queue");
  await setProviders(queuedProvider.id, null);
  const jobs = await Promise.all([job(), job(), job()]);
  const reads = jobs.map((item) => runImportJob(item.id));
  await waitUntilStarted("slow-queue");
  // Let both admitted workers reach their held provider request.
  for (let i = 0; i < 100 && (await read(jobs[1].id)).status !== "running"; i++)
    await Bun.sleep(10);
  const waiting = await read(jobs[2].id);
  assert.equal(waiting.status, "queued");
  // Waiting for a slot is not "stuck", however long the queue takes, but a queued
  // job this process is not holding is, even while other reads are running.
  const longAgo = new Date(Date.now() - 7 * 60_000);
  assert.equal(isStaleJob({ ...waiting, updatedAt: longAgo }), false);
  assert.equal(
    isStaleJob({ ...waiting, id: crypto.randomUUID(), updatedAt: longAgo }),
    true,
  );
  // The SQL twin agrees: seven minutes on, a queued job no worker holds is stuck, a waiting one not.
  const orphan = await job();
  const stuck = await db
    .select({ id: schema.extractionJob.id })
    .from(schema.extractionJob)
    .where(staleJobCondition(Date.now() + 7 * 60_000));
  const stuckIds = new Set(stuck.map((row) => row.id));
  assert.equal(stuckIds.has(orphan.id), true);
  assert.equal(stuckIds.has(jobs[2].id), false);
  await db
    .update(schema.extractionJob)
    .set({ status: "failed" })
    .where(eq(schema.extractionJob.id, orphan.id));
  held.release();
  await Promise.all(reads);
  for (const item of jobs)
    assert.equal((await read(item.id)).status, "needs_review");
}

// An in-flight reservation blocks another request before any actual usage has arrived.
{
  const { reserveTokenBudget, reconcileTokenBudget } =
    await import("../../src/server/modules/llm/routing");
  // PGlite implements the same PostgreSQL transaction operations as the production driver.
  const budgetDb = db as unknown as Database;
  const limited = await provider("limited", {
    monthlyTokenLimit: 100,
    pauseAtLimit: true,
  });
  const reservations = await Promise.allSettled([
    reserveTokenBudget(budgetDb, limited.id, 80),
    reserveTokenBudget(budgetDb, limited.id, 80),
  ]);
  const admitted = reservations.filter(
    (result) => result.status === "fulfilled",
  );
  assert.equal(admitted.length, 1);
  assert.equal(
    reservations.filter((result) => result.status === "rejected").length,
    1,
  );
  const reservation = admitted[0]!.value;
  assert.equal((await monthlyTokenUsage(db)).get(limited.id), undefined);
  await reconcileTokenBudget(budgetDb, reservation, {
    providerId: limited.id,
    jobId: null,
    model: "limited",
  });
  const released = await reserveTokenBudget(budgetDb, limited.id, 80);
  await reconcileTokenBudget(budgetDb, released, {
    providerId: limited.id,
    jobId: null,
    model: "limited",
    inputTokens: 20,
  });
  assert.equal((await monthlyTokenUsage(db)).get(limited.id), 20);
}

// Errors that retain provider usage are charged even though extraction fails.
{
  const failedProvider = await provider("fails-with-usage");
  await setProviders(failedProvider.id, null);
  const failed = await job();
  await runImportJob(failed.id);
  assert.equal((await read(failed.id)).status, "failed");
  assert.equal((await monthlyTokenUsage(db)).get(failedProvider.id), 82);
}

// Upload admission checks outstanding jobs before writing the file.
{
  const outstanding = await Promise.all(
    Array.from({ length: 10 }, () => job()),
  );
  await mock.module("~/server/auth/session-policy", () => ({
    getSessionFor: async () => ({ user: { id: "owner" } }),
  }));
  await mock.module("~/server/auth/enrollment", () => ({
    needsTwoFactorEnrollment: () => false,
  }));
  await mock.module("next/server", () => ({
    after: () => undefined,
    NextResponse: {
      json: (body: unknown, init: ResponseInit) => Response.json(body, init),
    },
  }));
  const { POST } = await import("../../src/app/api/imports/route");
  const form = new FormData();
  form.set("accountId", account!.id);
  form.set(
    "file",
    new File([new Uint8Array([137, 80, 78, 71])], "upload.png", {
      type: "image/png",
    }),
  );
  const response = await POST(
    new Request("http://localhost/api/imports", { method: "POST", body: form }),
  );
  assert.equal(response.status, 429);
  assert.match(await response.text(), /queued or running/);
  // A re-upload is a duplicate even while the queue limit is reached, and writes nothing.
  await db
    .update(schema.document)
    .set({ sha256: "unused" })
    .where(eq(schema.document.id, outstanding[0]!.documentId));
  const callsBefore = saveUploadCalls;
  const duplicate = await POST(
    new Request("http://localhost/api/imports", { method: "POST", body: form }),
  );
  assert.equal(duplicate.status, 409);
  assert.equal(
    ((await duplicate.json()) as { jobId: string }).jobId,
    outstanding[0]!.id,
  );
  assert.equal(saveUploadCalls, callsBefore);
  await db
    .update(schema.document)
    .set({ sha256: crypto.randomUUID() })
    .where(eq(schema.document.id, outstanding[0]!.documentId));
  // The same admission path also enforces storage before saving any bytes.
  for (const item of outstanding)
    await db
      .update(schema.extractionJob)
      .set({ status: "failed" })
      .where(eq(schema.extractionJob.id, item.id));
  await db
    .update(schema.document)
    .set({ sizeBytes: 250 * 1024 * 1024 })
    .where(eq(schema.document.id, outstanding[0]!.documentId));
  const overStorage = await POST(
    new Request("http://localhost/api/imports", { method: "POST", body: form }),
  );
  assert.equal(overStorage.status, 413);
  assert.match(await overStorage.text(), /250 MiB/);
}

// 5. Spent tokens still count after the import is deleted.
{
  const before = (await monthlyTokenUsage(db)).get(vision.id);
  assert.equal(before, 110);
  await db.delete(schema.document).where(eq(schema.document.ownerId, "owner"));
  assert.equal(await db.$count(schema.extractionJob), 0);
  assert.equal((await monthlyTokenUsage(db)).get(vision.id), 110);
  // The stopped read in scenario 1 spent tokens too, even though its result was discarded.
  const slowUsage = await db
    .select()
    .from(schema.llmUsage)
    .where(eq(schema.llmUsage.model, "slow-first"));
  assert.equal(slowUsage.length, 1);
}

await engine.close();
console.log("import runner scenarios passed");
