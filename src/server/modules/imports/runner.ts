import "server-only";

import { and, eq, inArray, lt, or, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  document,
  extractionJob,
  financialAccount,
  stagedRow,
  user,
} from "~/server/db/schema";
import { resolveAccessScope } from "~/server/lib/access";
import {
  extractDocument,
  NeedsVisionError,
  UnreadableDocumentError,
} from "~/server/modules/extraction";
import { LlmError } from "~/server/modules/llm";
import { describeLlmError } from "~/server/modules/llm/errors";
import { importProviders } from "~/server/modules/llm/routing";
import { stageExtraction } from "./stage";
import { readUpload } from "./storage";

/**
 * Process-wide worker slots, shared across route bundles and development reloads. Assumes one
 * app process per database (docker-compose runs one): which queued jobs are waiting, as opposed
 * to stuck, is known only to this process. Several replicas would need persisted leases.
 */
export const IMPORT_CONCURRENCY = 2;
export const MAX_OUTSTANDING_IMPORTS = 10;
export const MAX_USER_UPLOAD_BYTES = 250 * 1024 * 1024;
const globalQueue = globalThis as typeof globalThis & {
  finfolioImportQueue?: {
    running: number;
    waiting: Array<() => void>;
    pending: Map<string, Promise<void>>;
  };
};
const queue = (globalQueue.finfolioImportQueue ??= {
  running: 0,
  waiting: [],
  pending: new Map<string, Promise<void>>(),
});

/** Resolves when this queued attempt finishes, keeping Next's after() task alive. */
export function runImportJob(jobId: string): Promise<void> {
  const pending = queue.pending.get(jobId);
  if (pending) return pending;
  let waiting = false;
  const attempt = (async () => {
    await new Promise<void>((resolve) => {
      const start = () => {
        queue.running++;
        queue.pending.delete(jobId);
        resolve();
      };
      if (queue.running < IMPORT_CONCURRENCY) start();
      else {
        waiting = true;
        queue.waiting.push(start);
      }
    });
    try {
      await executeImportJob(jobId);
    } finally {
      queue.running--;
      queue.waiting.shift()?.();
    }
  })();
  // Deduplicate only waiting entries; a stopped running attempt may legitimately be retried.
  if (waiting) {
    queue.pending.set(jobId, attempt);
  }
  return attempt;
}

export class ImportLimitError extends Error {}

/** Retry admission shares the owner's upload lock and outstanding-job budget. */
export async function requeueImportJob(
  database: typeof db,
  jobId: string,
  expectedStatus: string,
) {
  return database.transaction(async (tx) => {
    const [job] = await tx
      .select()
      .from(extractionJob)
      .where(eq(extractionJob.id, jobId));
    if (!job) return false;
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, job.ownerId))
      .for("update");
    if (expectedStatus === "failed") {
      const outstanding = await tx.$count(
        extractionJob,
        and(
          eq(extractionJob.ownerId, job.ownerId),
          inArray(extractionJob.status, ["queued", "running"]),
        ),
      );
      if (outstanding >= MAX_OUTSTANDING_IMPORTS) {
        throw new ImportLimitError(
          `You already have ${MAX_OUTSTANDING_IMPORTS} queued or running imports. Wait for an import to finish before retrying.`,
        );
      }
    }
    const [updated] = await tx
      .update(extractionJob)
      .set({ status: "queued", error: null })
      .where(
        and(
          eq(extractionJob.id, jobId),
          sql`${extractionJob.status} = ${expectedStatus}`,
        ),
      )
      .returning({ id: extractionJob.id });
    return !!updated;
  });
}

/** A read still running after this long lost its worker (e.g. a restart) and may be retried. */
export const STALE_AFTER_MS = 6 * 60_000;
/** Recovery re-enqueues persisted waiting jobs through the shared worker slots. */
const ORPHANED_AFTER_MS = 60_000;

/** Long enough for a multi-page scanned statement on a slow model. */
const EXTRACTION_TIMEOUT_MS = 280_000;
/** With a fallback, both attempts together stay inside the 6-minute "stale" window. */
const PRIMARY_WITH_FALLBACK_TIMEOUT_MS = 180_000;
const FALLBACK_TIMEOUT_MS = 160_000;

/**
 * Queued (or retried) and never started, or started and never finished, within the window.
 * A job still waiting for a worker slot in this process is not stale, however long it waits.
 */
export const isStaleJob = (
  job: { id: string; status: string; startedAt: Date | null; updatedAt: Date },
  now = Date.now(),
) =>
  (job.status === "running" &&
    !!job.startedAt &&
    now - job.startedAt.getTime() > STALE_AFTER_MS) ||
  (job.status === "queued" &&
    !queue.pending.has(job.id) &&
    now - job.updatedAt.getTime() > STALE_AFTER_MS);

/** SQL twin of `isStaleJob`. */
export function staleJobCondition(now = Date.now()) {
  const before = new Date(now - STALE_AFTER_MS);
  return or(
    and(
      eq(extractionJob.status, "running"),
      lt(extractionJob.startedAt, before),
    ),
    and(
      eq(extractionJob.status, "queued"),
      // One text parameter (UUIDs never contain commas), however many jobs are waiting.
      queue.pending.size
        ? sql`${extractionJob.id} <> all(string_to_array(${[...queue.pending.keys()].join(",")}, ',')::uuid[])`
        : undefined,
      lt(extractionJob.updatedAt, before),
    ),
  );
}

/** Thrown inside the staging transaction when this attempt was stopped or replaced mid-read. */
class JobCancelledError extends Error {}

function describeFailure(error: unknown) {
  return error instanceof UnreadableDocumentError
    ? error.message
    : error instanceof Error && error.name === "TimeoutError"
      ? "Reading the statement took too long. Try again, or split it into smaller files."
      : describeLlmError(error);
}

/**
 * Read one uploaded statement with the default AI provider and stage what it found for review.
 * Runs after the upload response is sent; the client polls the job. Claiming the job with a
 * conditional update means a retry and a late duplicate call can never both run it.
 */
async function executeImportJob(jobId: string) {
  const [job] = await db
    .update(extractionJob)
    .set({
      status: "running",
      attempts: sql`${extractionJob.attempts} + 1`,
      startedAt: new Date(),
      error: null,
    })
    .where(
      and(
        eq(extractionJob.id, jobId),
        inArray(extractionJob.status, ["queued"]),
      ),
    )
    .returning();
  if (!job) return;
  // The attempt number makes this run's writes its own: if an admin stops it and a retry starts,
  // the retry has a higher attempt number, so this run's late result cannot overwrite it.
  const stillRunning = and(
    eq(extractionJob.id, job.id),
    eq(extractionJob.status, "running"),
    eq(extractionJob.attempts, job.attempts),
  );
  let providerId: string | null = null;
  let model: string | null = null;

  try {
    const [doc] = await db
      .select()
      .from(document)
      .where(eq(document.id, job.documentId))
      .limit(1);
    if (!doc?.accountId)
      throw new UnreadableDocumentError(
        "The account for this upload was removed.",
      );
    const [account] = await db
      .select({
        id: financialAccount.id,
        type: financialAccount.type,
        currency: financialAccount.currency,
      })
      .from(financialAccount)
      .where(eq(financialAccount.id, doc.accountId))
      .limit(1);
    if (!account)
      throw new UnreadableDocumentError(
        "The account for this upload was removed.",
      );

    if (doc.filePurgedAt)
      throw new UnreadableDocumentError(
        "The stored file was deleted by the retention policy. Upload it again.",
      );
    const data = await readUpload(doc.storageKey);
    const providers = await importProviders(db, job.id);
    let result: Awaited<ReturnType<typeof extractDocument>> | undefined;
    const failures: string[] = [];
    for (const [index, { provider, createAdapter }] of providers.entries()) {
      providerId = provider.id;
      model = provider.defaultModel;
      const timeout =
        providers.length === 1
          ? EXTRACTION_TIMEOUT_MS
          : index === 0
            ? PRIMARY_WITH_FALLBACK_TIMEOUT_MS
            : FALLBACK_TIMEOUT_MS;
      try {
        result = await extractDocument(db, {
          data,
          mediaType: doc.mimeType,
          filename: doc.fileName,
          institutionId: doc.institutionId,
          llm: {
            adapter: createAdapter(),
            supportsVision: provider.supportsVision,
          },
          signal: AbortSignal.timeout(timeout),
        });
        break;
      } catch (error) {
        // A file no model can read is final. Provider failures, and an image sent to a text-only
        // model, fall back to the next provider.
        const final =
          error instanceof UnreadableDocumentError &&
          !(error instanceof NeedsVisionError);
        if (final || index === providers.length - 1) {
          // Each part is already a sanitised description, so the combined message is safe to show.
          throw failures.length
            ? new LlmError(
                `${failures.join(" ")} Fallback ${provider.name} also failed: ${describeFailure(error)}`,
              )
            : error;
        }
        failures.push(`${provider.name} failed (${describeFailure(error)}).`);
      }
    }
    if (!result) throw new LlmError("No AI provider answered.");
    const out = result.output;

    await db.transaction(async (tx) => {
      await tx.delete(stagedRow).where(eq(stagedRow.jobId, job.id));
      const staged = await stageExtraction(
        tx,
        resolveAccessScope(job.ownerId),
        job.id,
        account,
        out,
      );
      const [updated] = await tx
        .update(extractionJob)
        .set({
          status: "needs_review",
          result: { ...out, stagingNotes: staged.notes },
          providerId,
          model: result.model,
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
          finishedAt: new Date(),
        })
        .where(stillRunning)
        .returning({ id: extractionJob.id });
      if (!updated) throw new JobCancelledError();
      await tx
        .update(document)
        .set({
          kind: out.documentType,
          periodStart: out.periodStart,
          periodEnd: out.periodEnd,
        })
        .where(eq(document.id, doc.id));
    });
  } catch (error) {
    if (error instanceof JobCancelledError) return;
    await db
      .update(extractionJob)
      .set({
        status: "failed",
        error: describeFailure(error),
        providerId,
        model,
        finishedAt: new Date(),
      })
      .where(stillRunning);
  }
}

/**
 * Puts imports back on track after a restart or crash. A read that never finished is marked
 * failed so its owner can try again (it is not re-run automatically, which could spend tokens on
 * a file that keeps timing out). A queued read whose request was lost before it started is run.
 */
export async function recoverImportJobs(now = Date.now()) {
  const interrupted = await db
    .update(extractionJob)
    .set({
      status: "failed",
      error:
        "Reading stopped part-way, probably because the server restarted. Read it again.",
      finishedAt: new Date(now),
    })
    .where(
      and(
        eq(extractionJob.status, "running"),
        lt(extractionJob.startedAt, new Date(now - STALE_AFTER_MS)),
      ),
    )
    .returning({ id: extractionJob.id });
  const orphaned = await db
    .select({ id: extractionJob.id })
    .from(extractionJob)
    .where(
      and(
        eq(extractionJob.status, "queued"),
        lt(extractionJob.updatedAt, new Date(now - ORPHANED_AFTER_MS)),
      ),
    )
    .orderBy(extractionJob.updatedAt);
  // Recovery uses the same bounded queue as uploads and retries.
  await Promise.all(orphaned.map(({ id }) => runImportJob(id)));
  return { interrupted: interrupted.length, started: orphaned.length };
}
