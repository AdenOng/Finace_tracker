import "server-only";

import { and, eq, gt, isNull, sql } from "drizzle-orm";

import { env } from "~/env";
import type { Database } from "~/server/db";
import { account, passwordReset, session, user } from "~/server/db/schema";
import { recordAudit } from "~/server/lib/audit";
import { trySendMail } from "~/server/lib/mailer";
import { auth } from "./config";
import { generateInviteToken, hashInviteToken } from "./invitations";

export const PASSWORD_RESET_TTL_HOURS = 24;
/** Links people email themselves are short-lived; an admin's link lasts a day. */
export const REQUESTED_RESET_TTL_MINUTES = 60;
/** One emailed link per person per this long, so nobody can flood someone's inbox. */
const REQUEST_INTERVAL_MS = 5 * 60_000;

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

/**
 * "Forgot password": emails a reset link to the account with this address, if there is one.
 * Callers must not reveal the outcome, so the sign-in page cannot be used to probe addresses.
 * Requires outgoing email; the link replaces any older pending one.
 */
export async function requestPasswordReset(db: Database, email: string) {
  const [target] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(
      and(
        eq(sql`lower(${user.email})`, email.trim().toLowerCase()),
        sql`${user.banned} is not true`,
      ),
    )
    .limit(1);
  if (!target) return "unknown" as const;

  const token = generateInviteToken();
  const created = await db.transaction(async (tx) => {
    // Lock the person, including when they have no reset rows yet, so overlapping requests
    // cannot both pass the cooldown check before either inserts its link.
    await tx
      .select({ id: user.id })
      .from(user)
      .where(eq(user.id, target.id))
      .for("no key update");
    const [recent] = await tx
      .select({ id: passwordReset.id })
      .from(passwordReset)
      .where(
        and(
          eq(passwordReset.userId, target.id),
          eq(passwordReset.createdById, target.id),
          gt(
            passwordReset.createdAt,
            new Date(Date.now() - REQUEST_INTERVAL_MS),
          ),
        ),
      )
      .limit(1);
    if (recent) return false;
    await tx
      .update(passwordReset)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(passwordReset.userId, target.id),
          isNull(passwordReset.usedAt),
          isNull(passwordReset.revokedAt),
        ),
      );
    await tx.insert(passwordReset).values({
      id: crypto.randomUUID(),
      userId: target.id,
      tokenHash: hashInviteToken(token),
      createdById: target.id,
      expiresAt: new Date(Date.now() + REQUESTED_RESET_TTL_MINUTES * 60_000),
    });
    await recordAudit(tx, {
      actorId: target.id,
      action: "user.password_reset_requested",
      targetType: "user",
      targetId: target.id,
      targetLabel: target.email,
    });
    return true;
  });
  if (!created) return "throttled" as const;

  const error = await trySendMail({
    to: target.email,
    subject: "Reset your Finfolio password",
    text: [
      `Hi ${target.name},`,
      "",
      "Someone asked to reset the password for your Finfolio account. To choose a new one, open:",
      "",
      `${env.BETTER_AUTH_URL}/reset/${token}`,
      "",
      `It works once and expires in ${REQUESTED_RESET_TTL_MINUTES} minutes. Using it signs you out everywhere.`,
      "If you didn't ask for this, ignore this email; your password stays the same.",
    ].join("\n"),
  });
  return error ? ("failed" as const) : ("sent" as const);
}
