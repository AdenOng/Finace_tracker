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
  UnreadableDocumentError,
} from "~/server/modules/extraction";
import { describeLlmError } from "~/server/modules/llm/errors";
import { stageExtraction } from "./stage";
import { readUpload } from "./storage";

/** Long enough for a multi-page scanned statement on a slow model. */
const EXTRACTION_TIMEOUT_MS = 280_000;

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

    const result = await extractDocument(db, {
      data: await readUpload(doc.storageKey),
      mediaType: doc.mimeType,
      filename: doc.fileName,
      institutionId: doc.institutionId,
      signal: AbortSignal.timeout(EXTRACTION_TIMEOUT_MS),
    });
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
      await tx
        .update(extractionJob)
        .set({
          status: "needs_review",
          result: { ...out, stagingNotes: staged.notes },
          model: result.model,
          inputTokens: result.usage.inputTokens ?? null,
          outputTokens: result.usage.outputTokens ?? null,
          finishedAt: new Date(),
        })
        .where(eq(extractionJob.id, job.id));
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
    await db
      .update(extractionJob)
      .set({
        status: "failed",
        error:
          error instanceof UnreadableDocumentError
            ? error.message
            : error instanceof Error && error.name === "TimeoutError"
              ? "Reading the statement took too long. Try again, or split it into smaller files."
              : describeLlmError(error),
        finishedAt: new Date(),
      })
      .where(eq(extractionJob.id, job.id));
  }
}
