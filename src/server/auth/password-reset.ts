import "server-only";

import { and, eq, gt, isNull } from "drizzle-orm";

import type { Database } from "~/server/db";
import { account, passwordReset, session, user } from "~/server/db/schema";
import { recordAudit } from "~/server/lib/audit";
import { auth } from "./config";
import { hashInviteToken } from "./invitations";

export const PASSWORD_RESET_TTL_HOURS = 24;

export class PasswordResetError extends Error {}

/** Returns the pending reset for this token with its user's email, or null if unusable. */
export async function findPendingPasswordReset(db: Database, token: string) {
  const [row] = await db
    .select({ id: passwordReset.id, userId: user.id, email: user.email })
    .from(passwordReset)
    .innerJoin(user, eq(user.id, passwordReset.userId))
    .where(
      and(
        eq(passwordReset.tokenHash, hashInviteToken(token)),
        isNull(passwordReset.usedAt),
        isNull(passwordReset.revokedAt),
        gt(passwordReset.expiresAt, new Date()),
      ),
    )
    .limit(1);
  return row ?? null;
}

/**
 * Sets a new password from a reset link. The link is claimed atomically before anything else, so
 * it can never be used twice. Every existing session is signed out afterwards.
 */
export async function consumePasswordReset(
  db: Database,
  token: string,
  newPassword: string,
) {
  const ctx = await auth.$context;
  const { minPasswordLength, maxPasswordLength } = ctx.password.config;
  if (
    newPassword.length < minPasswordLength ||
    newPassword.length > maxPasswordLength
  ) {
    throw new PasswordResetError(
      `Use between ${minPasswordLength} and ${maxPasswordLength} characters.`,
    );
  }
  const hash = await ctx.password.hash(newPassword);

  await db.transaction(async (tx) => {
    const [claimed] = await tx
      .update(passwordReset)
      .set({ usedAt: new Date() })
      .where(
        and(
          eq(passwordReset.tokenHash, hashInviteToken(token)),
          isNull(passwordReset.usedAt),
          isNull(passwordReset.revokedAt),
          gt(passwordReset.expiresAt, new Date()),
        ),
      )
      .returning({ userId: passwordReset.userId });
    if (!claimed) {
      throw new PasswordResetError("This reset link no longer works.");
    }
    const updated = await tx
      .update(account)
      .set({ password: hash, updatedAt: new Date() })
      .where(
        and(
          eq(account.userId, claimed.userId),
          eq(account.providerId, "credential"),
        ),
      )
      .returning({ id: account.id });
    // Passkey-only users get a password sign-in added.
    if (!updated.length) {
      await tx.insert(account).values({
        id: crypto.randomUUID(),
        userId: claimed.userId,
        accountId: claimed.userId,
        providerId: "credential",
        password: hash,
      });
    }
    await tx.delete(session).where(eq(session.userId, claimed.userId));
    await recordAudit(tx, {
      actorId: claimed.userId,
      action: "user.password_reset_used",
      targetType: "user",
      targetId: claimed.userId,
    });
  });
}
