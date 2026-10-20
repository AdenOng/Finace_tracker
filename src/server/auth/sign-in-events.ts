import "server-only";

import { createAuthMiddleware, getIP, isAPIError } from "better-auth/api";
import { and, eq } from "drizzle-orm";

import { env } from "~/env";
import { describeUserAgent } from "~/lib/user-agent";
import { db } from "~/server/db";
import { signInEvent, user } from "~/server/db/schema";
import { cachedInstanceSettings } from "~/server/lib/instance-settings-cache";
import { isEmailConfigured, trySendMail } from "~/server/lib/mailer";

/** Endpoints that end in a signed-in session (or a refusal). */
const SIGN_IN_METHODS: Record<string, string> = {
  "/sign-in/email": "password",
  "/two-factor/verify-totp": "two_factor",
  "/two-factor/verify-backup-code": "backup_code",
  "/passkey/verify-authentication": "passkey",
};

async function alertNewDevice(
  to: { email: string; name: string },
  device: string,
  ip: string | null,
) {
  await trySendMail({
    to: to.email,
    subject: "New sign-in to your Finfolio account",
    text: [
      `Hi ${to.name},`,
      "",
      `Your Finfolio account was just signed in to from ${device}${ip ? ` (${ip})` : ""}.`,
      "",
      "If this was you, there is nothing to do. If not, change your password and sign out other",
      `devices from Settings: ${env.BETTER_AUTH_URL}/settings`,
    ].join("\n"),
  });
}

/**
 * Better Auth `after` hook: records every sign-in attempt for Admin → Security. Never stores
 * passwords or codes, and never blocks or changes the sign-in itself.
 */
export const recordSignIns = createAuthMiddleware(async (ctx) => {
  const method = SIGN_IN_METHODS[ctx.path];
  if (!method) return;
  try {
    const created = ctx.context.newSession;
    const source = ctx.request ?? ctx.headers;
    const ip = source ? getIP(source, ctx.context.options) : null;
    const userAgent =
      created?.session.userAgent ?? ctx.headers?.get("user-agent") ?? null;
    const device = describeUserAgent(userAgent);

    if (created) {
      const { session, user: signedIn } = created;
      const previous = await db
        .select({ device: signInEvent.device })
        .from(signInEvent)
        .where(
          and(
            eq(signInEvent.userId, signedIn.id),
            eq(signInEvent.success, true),
          ),
        );
      // The first recorded sign-in is not "new": there is nothing to compare it with.
      const newDevice =
        previous.length > 0 && !previous.some((p) => p.device === device);
      await db.insert(signInEvent).values({
        userId: signedIn.id,
        email: signedIn.email,
        success: true,
        method,
        ipAddress: session.ipAddress ?? ip,
        userAgent,
        device,
        sessionId: session.id,
        newDevice,
      });
      if (
        newDevice &&
        cachedInstanceSettings().newDeviceAlerts &&
        isEmailConfigured()
      ) {
        void alertNewDevice(signedIn, device, session.ipAddress ?? ip);
      }
      return;
    }

    const returned = ctx.context.returned;
    if (!isAPIError(returned)) return;
    const body = ctx.body as { email?: unknown } | undefined;
    const email =
      method === "password" && typeof body?.email === "string"
        ? body.email.trim().toLowerCase().slice(0, 254)
        : null;
    const [known] = email
      ? await db
          .select({ id: user.id })
          .from(user)
          .where(eq(user.email, email))
          .limit(1)
      : [];
    await db.insert(signInEvent).values({
      userId: known?.id ?? null,
      email,
      success: false,
      method,
      reason: (returned.message || returned.status.toString()).slice(0, 200),
      ipAddress: ip,
      userAgent,
      device,
    });
  } catch (error) {
    console.error("[auth] could not record sign-in", error);
  }
});
