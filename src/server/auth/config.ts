import "server-only";

import { passkey } from "@better-auth/passkey";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { APIError } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { admin, twoFactor } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { env } from "~/env";
import { db } from "~/server/db";
import * as schema from "~/server/db/schema";
import { claimInitialAdmin } from "./bootstrap";
import { findPendingInvitation, INVITE_TOKEN_HEADER } from "./invitations";

export const APP_NAME = "Finfolio";

// Fallback only matters during `next build`, where env validation is skipped.
const baseUrl = new URL(env.BETTER_AUTH_URL ?? "http://localhost:3000");

export const auth = betterAuth({
  appName: APP_NAME,
  baseURL: baseUrl.origin,
  secret: env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
      twoFactor: schema.twoFactor,
      passkey: schema.passkey,
    },
  }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  rateLimit: {
    enabled: true,
    storage: "memory",
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/two-factor/verify-totp": { window: 60, max: 5 },
    },
  },
  databaseHooks: {
    user: {
      create: {
        /**
         * Invite-only registration. The very first account becomes the admin; everyone after
         * that must present a valid invitation token for their email address. The count is only a
         * fast path; `claimInitialAdmin` is what makes concurrent first sign-ups safe.
         */
        before: async (user, ctx) => {
          const existingUsers = await db.$count(schema.user);
          if (existingUsers === 0 && (await claimInitialAdmin(db))) {
            return { data: { ...user, role: "admin" } };
          }
          const token = ctx?.headers?.get(INVITE_TOKEN_HEADER);
          const invite = token ? await findPendingInvitation(db, token) : null;
          if (invite?.email.toLowerCase() !== user.email.toLowerCase()) {
            throw new APIError("FORBIDDEN", {
              message: "Registration is by invitation only.",
            });
          }
          return { data: { ...user, role: invite.role } };
        },
        after: async (user, ctx) => {
          await db.insert(schema.userSettings).values({ userId: user.id });
          const token = ctx?.headers?.get(INVITE_TOKEN_HEADER);
          const invite = token ? await findPendingInvitation(db, token) : null;
          if (invite) {
            await db
              .update(schema.invitation)
              .set({ acceptedAt: new Date() })
              .where(eq(schema.invitation.id, invite.id));
          }
        },
      },
    },
  },
  plugins: [
    admin({ defaultRole: "user", adminRoles: ["admin"] }),
    twoFactor({ issuer: APP_NAME }),
    passkey({
      rpID: baseUrl.hostname,
      rpName: APP_NAME,
      origin: baseUrl.origin,
    }),
    // Must be last: lets server actions set auth cookies.
    nextCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
