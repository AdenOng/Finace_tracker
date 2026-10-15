import type { Database } from "~/server/db";
import { auditLog } from "~/server/db/schema";

export type AuditEntry = {
  actorId: string | null;
  action: string;
  targetType:
    | "user"
    | "invitation"
    | "provider"
    | "category"
    | "institution"
    | "workspace";
  targetId?: string | null;
  targetLabel?: string | null;
  /** Identifiers and counts only — never secrets, tokens or financial data. */
  details?: Record<string, unknown>;
};

/** Records an admin or account-recovery action. Pass `tx` to commit it with the change it describes. */
export async function recordAudit(
  db: Pick<Database, "insert">,
  entry: AuditEntry,
) {
  await db.insert(auditLog).values({
    actorId: entry.actorId,
    action: entry.action,
    targetType: entry.targetType,
    targetId: entry.targetId ?? null,
    targetLabel: entry.targetLabel ?? null,
    details: entry.details ?? null,
  });
}
