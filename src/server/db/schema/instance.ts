/** Instance-wide admin policy and the sign-in history it is checked against. */
import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

import { id } from "./_columns";
import { llmProvider } from "./ai";
import { user } from "./auth";

/**
 * Single-row settings edited from Admin → Security and Admin → Data. A null column means "use the
 * deployment default" (an environment variable or the preset pack), so a fresh install behaves
 * exactly as it did before this table existed.
 */
export const instanceSettings = pgTable(
  "instance_settings",
  {
    id: integer("id").primaryKey().default(1),
    /** "everyone" | "admins" | "off". Ignored while REQUIRE_TWO_FACTOR=true forces everyone. */
    twoFactorPolicy: text("two_factor_policy"),
    /** Sign people out this many days after they signed in, even if they stay active. */
    maxSessionDays: integer("max_session_days"),
    /** Whether a workspace invitation may create a brand-new account. */
    workspaceInviteSignups: boolean("workspace_invite_signups")
      .default(true)
      .notNull(),
    /** Email people when their account signs in from a device it has not used before. */
    newDeviceAlerts: boolean("new_device_alerts").default(true).notNull(),
    /** Delete stored statement files this many days after their import finished. */
    documentRetentionDays: integer("document_retention_days"),
    /** Tried when the default provider fails or is over its monthly limit. */
    fallbackProviderId: uuid("fallback_provider_id").references(
      () => llmProvider.id,
      { onDelete: "set null" },
    ),
    providerHealthChecks: boolean("provider_health_checks")
      .default(true)
      .notNull(),
    /** Fetch market prices for held securities; sends ticker symbols (nothing else) to Yahoo. */
    priceQuotes: boolean("price_quotes").default(true).notNull(),
    /** Overrides the preset pack's CPF & SRS feature; null follows the pack. */
    cpfSrsEnabled: boolean("cpf_srs_enabled"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (t) => [check("instance_settings_single_row", sql`${t.id} = 1`)],
);

/**
 * One row per sign-in attempt. Passwords, codes and tokens are never stored; for failures only
 * the email that was typed, the reason and the network details are kept.
 */
export const signInEvent = pgTable(
  "sign_in_event",
  {
    id: id(),
    userId: text("user_id").references(() => user.id, {
      onDelete: "set null",
    }),
    email: text("email"),
    success: boolean("success").notNull(),
    /** "password" | "two_factor" | "backup_code" | "passkey". */
    method: text("method").notNull(),
    reason: text("reason"),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    /** "Chrome on macOS"-style label; a sign-in with an unseen label counts as a new device. */
    device: text("device"),
    /** Session created by a successful sign-in; no FK because sessions are deleted freely. */
    sessionId: text("session_id"),
    newDevice: boolean("new_device").default(false).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("sign_in_event_created_idx").on(t.createdAt),
    index("sign_in_event_user_idx").on(t.userId, t.createdAt),
  ],
);
