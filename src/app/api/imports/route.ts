import { and, eq } from "drizzle-orm";
import { after, NextResponse } from "next/server";

import { env } from "~/env";
import { auth } from "~/server/auth/config";
import { needsTwoFactorEnrollment } from "~/server/auth/enrollment";
import { db } from "~/server/db";
import { document, extractionJob, financialAccount } from "~/server/db/schema";
import { writableBy, resolveAccessScope } from "~/server/lib/access";
import {
  parseExtractionUpload,
  UploadValidationError,
} from "~/server/modules/extraction/upload";
import { holdsSecurities } from "~/lib/accounts";
import { runImportJob } from "~/server/modules/imports/runner";
import { saveUpload, sha256 } from "~/server/modules/imports/storage";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Upload a statement or screenshot for one of your accounts. The file is stored, a job is queued
 * and read in the background; the response returns at once with the job id to follow.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
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
    const [seen] = await db
      .select({ id: extractionJob.id })
      .from(document)
      .innerJoin(extractionJob, eq(extractionJob.documentId, document.id))
      .where(
        and(eq(document.ownerId, scope.userId), eq(document.sha256, hash)),
      )
      .limit(1);
    if (seen) {
      return NextResponse.json(
        { error: "This file has already been uploaded.", jobId: seen.id },
        { status: 409 },
      );
    }

    const storageKey = await saveUpload(scope.userId, hash, file.type, data);
    const jobId = await db.transaction(async (tx) => {
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
      return job!.id;
    });

    after(() => runImportJob(jobId));
    return NextResponse.json({ jobId }, { status: 202 });
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
