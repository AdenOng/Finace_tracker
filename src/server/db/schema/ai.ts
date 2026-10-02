/** LLM provider configuration used by the extraction pipeline. */
import { boolean, index, pgEnum, pgTable, text } from "drizzle-orm/pg-core";

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
    ...timestamps(),
  },
  (t) => [index("llm_provider_owner_idx").on(t.ownerId)],
);
