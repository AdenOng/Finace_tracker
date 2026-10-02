import { and, asc, eq, isNull } from "drizzle-orm";

import type { Database } from "~/server/db";
import { category, institution } from "~/server/db/schema";
import { getDefaultLlm, type LlmAdapter } from "../llm";
import { prepareDocumentInput, UnreadableDocumentError } from "./prepare-input";
import { buildExtractionPrompt, EXTRACTION_SYSTEM_PROMPT } from "./prompt";
import { buildStatementSchema } from "./schemas";

export * from "./schemas";
export { SUPPORTED_MIME_TYPES, UnreadableDocumentError } from "./prepare-input";

export async function loadActiveCategories(db: Database) {
  return db
    .select({
      key: category.key,
      name: category.name,
      kind: category.kind,
      aiHint: category.aiHint,
    })
    .from(category)
    .where(isNull(category.archivedAt))
    .orderBy(asc(category.sortOrder));
}

/**
 * Turn one document into validated structured data. Pure with respect to finance tables — the
 * caller decides whether to stage the result (pipeline) or just display it (admin playground).
 */
export async function extractDocument(
  db: Database,
  input: {
    data: Uint8Array;
    mediaType: string;
    filename?: string;
    institutionId?: string | null;
    model?: string;
    /** Provider + whether its model reads images. Defaults to the platform default provider. */
    llm?: { adapter: LlmAdapter; supportsVision: boolean };
    signal?: AbortSignal;
  },
) {
  const categories = await loadActiveCategories(db);
  const keys = categories.map((c) => c.key);
  if (keys.length === 0) throw new Error("No active categories configured");

  const [inst] = input.institutionId
    ? await db
        .select({
          name: institution.name,
          extractionHints: institution.extractionHints,
        })
        .from(institution)
        .where(
          and(
            eq(institution.id, input.institutionId),
            isNull(institution.archivedAt),
          ),
        )
        .limit(1)
    : [];

  const prepared = await prepareDocumentInput(
    input.data,
    input.mediaType,
    input.filename,
  );
  let llm = input.llm;
  if (!llm) {
    const { adapter, provider } = await getDefaultLlm(db);
    llm = { adapter, supportsVision: provider.supportsVision };
  }
  if (prepared.files.length > 0 && !llm.supportsVision) {
    throw new UnreadableDocumentError(
      "This document is an image or has scanned pages without a text layer, and the selected model is text-only. Pick a provider that can read images.",
    );
  }
  const adapter = llm.adapter;
  const startedAt = Date.now();

  const result = await adapter.generateStructured({
    system: EXTRACTION_SYSTEM_PROMPT,
    prompt: buildExtractionPrompt({
      categories,
      institution: inst,
      documentText: prepared.text,
    }),
    files: prepared.files,
    schema: buildStatementSchema(keys as [string, ...string[]]),
    schemaName: "statement_extraction",
    model: input.model,
    signal: input.signal,
  });

  return {
    ...result,
    durationMs: Date.now() - startedAt,
    usedTextLayer: prepared.text !== null,
    pageCount: prepared.pageCount,
  };
}
