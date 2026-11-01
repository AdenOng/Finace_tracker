import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { after, NextResponse } from "next/server";

import { env } from "~/env";
import { needsTwoFactorEnrollment } from "~/server/auth/enrollment";
import { getSessionFor } from "~/server/auth/session-policy";
import { db } from "~/server/db";
import {
  document,
  extractionJob,
  financialAccount,
  user,
} from "~/server/db/schema";
import { writableBy, resolveAccessScope } from "~/server/lib/access";
import {
  parseExtractionUpload,
  UploadValidationError,
} from "~/server/modules/extraction/upload";
import { holdsSecurities } from "~/lib/accounts";
import {
  MAX_OUTSTANDING_IMPORTS,
  MAX_USER_UPLOAD_BYTES,
  runImportJob,
} from "~/server/modules/imports/runner";
import {
  removeUpload,
  saveUpload,
  sha256,
} from "~/server/modules/imports/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Upload a statement or screenshot for one of your accounts. The file is stored, a job is queued
 * and read in the background; the response returns at once with the job id to follow.
 */
export async function POST(request: Request) {
  const session = await getSessionFor(request.headers);
  if (!session || needsTwoFactorEnrollment(session.user)) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.BETTER_AUTH_URL).origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const scope = resolveAccessScope(session.user.id);

  try {
    const { file, accountId } = await parseExtractionUpload(request);
    if (!accountId) throw new UploadValidationError("Choose an account");
    const [account] = await db
      .select({
        id: financialAccount.id,
        type: financialAccount.type,
        institutionId: financialAccount.institutionId,
        archivedAt: financialAccount.archivedAt,
      })
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.id, accountId),
          writableBy(scope, financialAccount.ownerId),
        ),
      )
      .limit(1);
    if (!account || account.archivedAt) {
      throw new UploadValidationError("Account not found", 404);
    }

    const data = new Uint8Array(await file.arrayBuffer());
    const hash = sha256(data);
    let storedKey: string | undefined;
    const jobId = await db
      .transaction(async (tx) => {
        // Serialize uploads for this owner so simultaneous requests cannot pass the same limits.
        await tx
          .select({ id: user.id })
          .from(user)
          .where(eq(user.id, scope.userId))
          .for("update");
        // A re-upload is reported as a duplicate even when the owner is at a limit.
        const [seen] = await tx
          .select({ id: extractionJob.id })
          .from(document)
          .innerJoin(extractionJob, eq(extractionJob.documentId, document.id))
          .where(
            and(eq(document.ownerId, scope.userId), eq(document.sha256, hash)),
          )
          .limit(1);
        if (seen) return { duplicate: seen.id };
        const outstanding = await tx.$count(
          extractionJob,
          and(
            eq(extractionJob.ownerId, scope.userId),
            inArray(extractionJob.status, ["queued", "running"]),
          ),
        );
        if (outstanding >= MAX_OUTSTANDING_IMPORTS) {
          throw new UploadValidationError(
            `You already have ${MAX_OUTSTANDING_IMPORTS} queued or running imports. Wait for an import to finish before uploading again.`,
            429,
          );
        }
        const [stored] = await tx
          .select({
            bytes: sql<number>`coalesce(sum(${document.sizeBytes}), 0)`.mapWith(
              Number,
            ),
          })
          .from(document)
          .where(
            and(
              eq(document.ownerId, scope.userId),
              isNull(document.filePurgedAt),
            ),
          );
        if ((stored?.bytes ?? 0) + file.size > MAX_USER_UPLOAD_BYTES) {
          throw new UploadValidationError(
            "Your stored uploads exceed the 250 MiB budget. Delete older imports before uploading again.",
            413,
          );
        }
        const storageKey = await saveUpload(
          scope.userId,
          hash,
          file.type,
          data,
        );
        storedKey = storageKey;
        const [doc] = await tx
          .insert(document)
          .values({
            ownerId: scope.userId,
            accountId: account.id,
            institutionId: account.institutionId,
            fileName: file.name.slice(0, 255),
            mimeType: file.type,
            sizeBytes: file.size,
            sha256: hash,
            storageKey,
            kind: file.type.startsWith("image/")
              ? "screenshot"
              : holdsSecurities(account.type)
                ? "brokerage_statement"
                : "bank_statement",
          })
          .returning({ id: document.id });
        const [job] = await tx
          .insert(extractionJob)
          .values({ ownerId: scope.userId, documentId: doc!.id })
          .returning({ id: extractionJob.id });
        return { created: job!.id };
      })
      .catch(async (error: unknown) => {
        if (storedKey) await removeUpload(storedKey);
        throw error;
      });
    if (jobId.duplicate) {
      return NextResponse.json(
        {
          error: "This file has already been uploaded.",
          jobId: jobId.duplicate,
        },
        { status: 409 },
      );
    }

    after(() => runImportJob(jobId.created!));
    return NextResponse.json({ jobId: jobId.created }, { status: 202 });
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    throw error;
  }
}
