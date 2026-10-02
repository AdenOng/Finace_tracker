import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { env } from "~/env";
import type { Database } from "~/server/db";
import { llmProvider } from "~/server/db/schema";
import { decryptSecret } from "~/server/lib/secrets";
import { createOpencodeAdapter } from "./adapters/opencode";
import {
  createAnthropicAdapter,
  createOpenAICompatibleAdapter,
} from "./adapters/ai-sdk";
import {
  type LlmAdapter,
  LlmError,
  type LlmProviderConfig,
  type LlmProviderKind,
} from "./types";

export * from "./types";

const adapters: Record<
  LlmProviderKind,
  (config: LlmProviderConfig) => LlmAdapter
> = {
  opencode: createOpencodeAdapter,
  openai_compatible: createOpenAICompatibleAdapter,
  anthropic: createAnthropicAdapter,
};

export function createLlmAdapter(config: LlmProviderConfig): LlmAdapter {
  return adapters[config.kind](config);
}

type ProviderRow = typeof llmProvider.$inferSelect;

export function toProviderConfig(row: ProviderRow): LlmProviderConfig {
  return {
    kind: row.kind,
    baseUrl: row.baseUrl,
    apiKey: row.apiKeyEncrypted ? decryptSecret(row.apiKeyEncrypted) : null,
    defaultModel: row.defaultModel,
    basicAuth:
      row.kind === "opencode" && env.OPENCODE_SERVER_PASSWORD
        ? {
            username: env.OPENCODE_SERVER_USERNAME,
            password: env.OPENCODE_SERVER_PASSWORD,
          }
        : undefined,
  };
}

/** The platform default provider (admin-configured). Per-user keys can slot in here later. */
export async function getDefaultLlm(db: Database) {
  const [row] = await db
    .select()
    .from(llmProvider)
    .where(
      and(
        isNull(llmProvider.ownerId),
        eq(llmProvider.isEnabled, true),
        eq(llmProvider.isDefault, true),
      ),
    )
    .limit(1);
  if (!row) {
    throw new LlmError(
      "No default AI provider is configured. An admin can set one under Admin → AI.",
    );
  }
  return { provider: row, adapter: createLlmAdapter(toProviderConfig(row)) };
}
