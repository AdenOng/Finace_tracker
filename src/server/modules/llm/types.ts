import type { z } from "zod";

export type LlmProviderKind = "opencode" | "openai_compatible" | "anthropic";

/** Everything an adapter needs to talk to a provider. API keys arrive already decrypted. */
export type LlmProviderConfig = {
  kind: LlmProviderKind;
  baseUrl?: string | null;
  apiKey?: string | null;
  defaultModel: string;
  /** opencode server basic auth (OPENCODE_SERVER_PASSWORD). */
  basicAuth?: { username: string; password: string };
};

export type LlmFile = {
  mediaType: string;
  data: Uint8Array;
  filename?: string;
};

export type StructuredRequest<T> = {
  system: string;
  prompt: string;
  files?: LlmFile[];
  schema: z.ZodType<T>;
  schemaName: string;
  /** Overrides the provider's default model. */
  model?: string;
  signal?: AbortSignal;
};

export type LlmUsage = {
  inputTokens?: number;
  outputTokens?: number;
};

export type StructuredResult<T> = {
  output: T;
  model: string;
  usage: LlmUsage;
};

export type ModelInfo = {
  id: string;
  name: string;
  supportsAttachments?: boolean;
};

/**
 * One implementation per provider kind (src/server/modules/llm/adapters). Adding a provider means
 * adding an adapter and registering it — callers only ever see this interface.
 */
export interface LlmAdapter {
  generateStructured<T>(
    request: StructuredRequest<T>,
  ): Promise<StructuredResult<T>>;
  listModels(): Promise<ModelInfo[]>;
}

export class LlmError extends Error {
  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "LlmError";
  }
}
