import { index, jsonb, pgTable, text, timestamp } from "drizzle-orm/pg-core";

import { id } from "./_columns";
import { user } from "./auth";

/**
 * Append-only record of admin actions and account recovery. `details` holds identifiers and
 * counts only — never secrets, tokens or anyone's financial data.
 */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "set null",
    }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    /** Human-readable name of the target at the time, so entries survive deletes. */
    targetLabel: text("target_label"),
    details: jsonb("details").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
  },
  (t) => [
    index("audit_log_created_idx").on(t.createdAt),
    index("audit_log_actor_idx").on(t.actorId),
  ],
);
