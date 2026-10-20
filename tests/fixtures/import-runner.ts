import { mock } from "bun:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";

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
        openingBalance: null,
        closingBalance: null,
        transactions: [],
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
await mock.module("~/server/modules/imports/storage", () => ({
  readUpload: async () => new Uint8Array([137, 80, 78, 71]),
  removeUpload: async () => undefined,
  saveUpload: async () => "unused",
  sha256: () => "unused",
}));

const { runImportJob } =
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

// 4. Spent tokens still count after the import is deleted.
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
