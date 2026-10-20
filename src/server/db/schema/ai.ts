/** LLM provider configuration used by the extraction pipeline. */
import {
  boolean,
  index,
  integer,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { id, timestamps } from "./_columns";
import { user } from "./auth";

export const llmProviderKind = pgEnum("llm_provider_kind", [
  "opencode",
  "openai_compatible",
  "anthropic",
]);

export const llmProvider = pgTable(
  "llm_provider",
  {
    id: id(),
    /** null = platform provider managed by an admin; set = a user's own key (future). */
    ownerId: text("owner_id").references(() => user.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    kind: llmProviderKind("kind").notNull(),
    baseUrl: text("base_url"),
    /** AES-256-GCM encrypted (src/server/lib/secrets.ts). Never sent to the browser. */
    apiKeyEncrypted: text("api_key_encrypted"),
    /** opencode: "providerID/modelID", e.g. "opencode-go/glm-5.3-flash". */
    defaultModel: text("default_model").notNull(),
    supportsVision: boolean("supports_vision").default(true).notNull(),
    isDefault: boolean("is_default").default(false).notNull(),
    isEnabled: boolean("is_enabled").default(true).notNull(),
    /** Result of the last connectivity check, manual or scheduled. */
    lastTestedAt: timestamp("last_tested_at", { withTimezone: true }),
    lastTestOk: boolean("last_test_ok"),
    lastTestError: text("last_test_error"),
    lastTestLatencyMs: integer("last_test_latency_ms"),
    /** Admin-entered list prices in US$ per million tokens, for cost estimates only. */
    inputCostPerMTok: numeric("input_cost_per_mtok", {
      precision: 12,
      scale: 4,
    }),
    outputCostPerMTok: numeric("output_cost_per_mtok", {
      precision: 12,
      scale: 4,
    }),
    /** Input + output tokens allowed per calendar month; null = unlimited. */
    monthlyTokenLimit: integer("monthly_token_limit"),
    /** Stop sending imports here once the limit is reached (the fallback is used instead). */
    pauseAtLimit: boolean("pause_at_limit").default(false).notNull(),
    ...timestamps(),
  },
  (t) => [index("llm_provider_owner_idx").on(t.ownerId)],
);

/**
 * Tokens spent per statement read. Kept apart from extraction jobs because people can delete
 * their imports, and monthly limits must still count what was already spent.
 */
export const llmUsage = pgTable(
  "llm_usage",
  {
    id: id(),
    providerId: uuid("provider_id").references(() => llmProvider.id, {
      onDelete: "set null",
    }),
    /** No FK: the job may be deleted with its import while the spend still counts. */
    jobId: uuid("job_id"),
    model: text("model"),
    inputTokens: integer("input_tokens").default(0).notNull(),
    outputTokens: integer("output_tokens").default(0).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("llm_usage_provider_created_idx").on(t.providerId, t.createdAt),
  ],
);
