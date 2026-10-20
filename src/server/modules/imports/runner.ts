import "server-only";

import { and, eq, inArray, sql } from "drizzle-orm";

import { db } from "~/server/db";
import {
  document,
  extractionJob,
  financialAccount,
  stagedRow,
} from "~/server/db/schema";
import { resolveAccessScope } from "~/server/lib/access";
import {
  extractDocument,
  NeedsVisionError,
  UnreadableDocumentError,
} from "~/server/modules/extraction";
import { LlmError } from "~/server/modules/llm";
import { describeLlmError } from "~/server/modules/llm/errors";
import {
  importProviders,
  recordTokenUsage,
} from "~/server/modules/llm/routing";
import { stageExtraction } from "./stage";
import { readUpload } from "./storage";

/** Long enough for a multi-page scanned statement on a slow model. */
const EXTRACTION_TIMEOUT_MS = 280_000;
/** With a fallback, both attempts together stay inside the 6-minute "stale" window. */
const PRIMARY_WITH_FALLBACK_TIMEOUT_MS = 180_000;
const FALLBACK_TIMEOUT_MS = 160_000;

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
export async function runImportJob(jobId: string) {
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
    const providers = await importProviders(db);
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
        await recordTokenUsage(db, {
          providerId: provider.id,
          jobId: job.id,
          model: result.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
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
