import type { StatementExtraction } from "~/server/modules/extraction/schemas";

export type PreviewResult = {
  output: StatementExtraction;
  model: string;
  usage: { inputTokens?: number; outputTokens?: number };
  durationMs: number;
  usedTextLayer: boolean;
  pageCount: number | null;
};
