import { NextResponse } from "next/server";

import { env } from "~/env";
import { auth } from "~/server/auth/config";
import { needsTwoFactorEnrollment } from "~/server/auth/enrollment";
import { db } from "~/server/db";
import {
  extractDocument,
  UnreadableDocumentError,
} from "~/server/modules/extraction";
import {
  parseExtractionUpload,
  UploadValidationError,
} from "~/server/modules/extraction/upload";
import { createLlmAdapter, toProviderConfig } from "~/server/modules/llm";
import { describeLlmError } from "~/server/modules/llm/errors";
import { findSharedProvider } from "~/server/modules/llm/providers";

export const runtime = "nodejs";
export const maxDuration = 300;

/**
 * Admin playground: run extraction on an uploaded file and return the JSON without saving
 * anything. Lets an admin compare models/prompts before trusting them with the real pipeline.
 */
export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: request.headers });
  if (
    session?.user.role !== "admin" ||
    needsTwoFactorEnrollment(session.user)
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.BETTER_AUTH_URL).origin) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { file, providerId, model, institutionId } =
      await parseExtractionUpload(request);
    let llm;
    if (providerId) {
      const row = await findSharedProvider(db, providerId);
      if (!row?.isEnabled)
        return NextResponse.json(
          { error: "Unknown or disabled provider" },
          { status: 400 },
        );
      llm = {
        adapter: createLlmAdapter(toProviderConfig(row)),
        supportsVision: row.supportsVision,
      };
    }
    const result = await extractDocument(db, {
      data: new Uint8Array(await file.arrayBuffer()),
      mediaType: file.type,
      filename: file.name,
      institutionId: institutionId ?? null,
      model,
      llm,
      signal: AbortSignal.timeout(280_000),
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof UploadValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: error.status },
      );
    }
    if (error instanceof UnreadableDocumentError) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    return NextResponse.json(
      { error: describeLlmError(error) },
      { status: 502 },
    );
  }
}
