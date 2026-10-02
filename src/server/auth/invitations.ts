import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";

import type { Database } from "~/server/db";
import { invitation } from "~/server/db/schema";

/** Header the invite page sends with the sign-up request so the auth hook can verify the token. */
export const INVITE_TOKEN_HEADER = "x-invite-token";
export const INVITE_TTL_DAYS = 7;

export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export function generateInviteToken(): string {
  return randomBytes(24).toString("base64url");
}

/** Returns the pending invitation for this token, or null if it is unknown, used, revoked or expired. */
export async function findPendingInvitation(db: Database, token: string) {
  const [row] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.tokenHash, hashInviteToken(token)),
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
        gt(invitation.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}
