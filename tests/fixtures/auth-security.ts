import { expect, mock } from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";

import * as schema from "../../src/server/db/schema";

const setupToken = "synthetic-setup-token-for-security-tests";
const missingToken = process.argv[2] === "missing-token";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
if (missingToken) delete process.env.SETUP_TOKEN;
else process.env.SETUP_TOKEN = setupToken;

const engine = new PGlite();
const db = drizzle(engine, { schema });
await mock.module("server-only", () => ({}));
await mock.module("~/server/db", () => ({ db }));
await mock.module("~/server/lib/mailer", () => ({
  isEmailConfigured: () => false,
  trySendMail: async () => null,
}));
const journal = (await Bun.file("drizzle/meta/_journal.json").json()) as {
  entries: { tag: string }[];
};
for (const { tag } of journal.entries)
  await engine.exec(await Bun.file(`drizzle/${tag}.sql`).text());

const { auth } = await import("../../src/server/auth/config");
const origin = "http://localhost:3000";
async function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return auth.handler(
    new Request(`${origin}/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json", origin, ...headers },
      body: JSON.stringify(body),
    }),
  );
}
function cookieFor(response: Response) {
  return (
    response.headers
      .getSetCookie()
      .filter(
        (cookie) =>
          cookie.startsWith("better-auth.session_token=") &&
          !cookie.startsWith("better-auth.session_token=;"),
      )
      .at(-1)
      ?.split(";")[0] ?? ""
  );
}
const signup = {
  name: "Synthetic Admin",
  email: "security-admin@example.com",
  password: "Synthetic-password-for-security-tests",
};

try {
  // A missing or incorrect credential must not consume the initial-admin claim.
  for (const token of [
    undefined,
    "incorrect-setup-token",
    ...(missingToken ? [setupToken] : []),
  ]) {
    const response = await post(
      "/sign-up/email",
      signup,
      token ? { "x-setup-token": token } : {},
    );
    expect(response.status).toBe(403);
    expect(await db.$count(schema.user)).toBe(0);
    expect(await db.$count(schema.adminBootstrap)).toBe(0);
  }
  if (!missingToken) {
    const response = await post("/sign-up/email", signup, {
      "x-setup-token": setupToken,
    });
    expect(response.status).toBe(200);
    const adminCookie = cookieFor(response);
    const adminSession = await auth.api.getSession({
      headers: new Headers({ cookie: adminCookie }),
    });
    expect(adminSession?.user.role).toBe("admin");
    expect(adminSession?.user.twoFactorEnabled).toBe(false);

    // The setup credential stops authorizing registration as soon as an account exists.
    expect(
      (
        await post(
          "/sign-up/email",
          { ...signup, email: "uninvited@example.com" },
          { "x-setup-token": setupToken, "x-forwarded-for": "192.0.2.10" },
        )
      ).status,
    ).toBe(403);

    await db.insert(schema.user).values({
      id: "security-member",
      name: "Synthetic Member",
      email: "security-member@example.com",
      role: "user",
      twoFactorEnabled: true,
    });
    await db.insert(schema.session).values({
      id: "security-member-session",
      userId: "security-member",
      token: "synthetic-private-session-token",
      expiresAt: new Date(Date.now() + 3_600_000),
    });

    // HTTP admin APIs stay inaccessible even after enrollment. Only the audited tRPC APIs remain.
    for (const enrolled of [false, true]) {
      await db
        .update(schema.user)
        .set({ twoFactorEnabled: enrolled })
        .where(eq(schema.user.id, adminSession!.user.id));
      for (const path of [
        "list-user-sessions",
        "impersonate-user",
        "set-user-password",
        "set-role",
        "ban-user",
        "update-user",
      ]) {
        const result = await post(
          `/admin/${path}`,
          {
            userId: "security-member",
            newPassword: "Synthetic-replacement-password",
            role: "admin",
          },
          { cookie: adminCookie },
        );
        expect(result.status).toBe(404);
        expect(await result.text()).not.toContain(
          "synthetic-private-session-token",
        );
      }
      for (const path of ["/admin/set-role/", "/admin/%73et-role"]) {
        const result = await post(
          path,
          { userId: "security-member", role: "admin" },
          { cookie: adminCookie },
        );
        expect(result.status).toBe(404);
      }
    }

    // Permission removal also prevents accidental server-side impersonation calls.
    await expect(
      auth.api.impersonateUser({
        headers: new Headers({ cookie: adminCookie }),
        body: { userId: "security-member" },
      }),
    ).rejects.toMatchObject({ status: "FORBIDDEN" });

    const { adminRouter } = await import("../../src/server/api/routers/admin");
    const { createTRPCContext } = await import("../../src/server/api/trpc");
    const headers = new Headers({ cookie: adminCookie });
    const caller = adminRouter.createCaller(
      await createTRPCContext({ headers }),
    );
    await caller.users.setRole({ userId: "security-member", role: "admin" });
    await caller.users.setBanned({ userId: "security-member", banned: true });
    expect(
      (await db.select().from(schema.auditLog)).map((row) => row.action),
    ).toEqual(["user.role_changed", "user.disabled"]);

    const invitation = await caller.users.invite({
      email: "invited@example.com",
      role: "user",
    });
    const invited = await post(
      "/sign-up/email",
      { ...signup, email: "invited@example.com" },
      {
        "x-invite-token": invitation.url.split("/").at(-1)!,
        "x-forwarded-for": "192.0.2.11",
      },
    );
    expect(invited.status).toBe(200);
    expect(
      ((await invited.json()) as { user: { role: string } }).user.role,
    ).toBe("user");

    // Sessions minted through the previous impersonation feature must no longer open finance data.
    await db
      .update(schema.session)
      .set({ impersonatedBy: "old-admin" })
      .where(eq(schema.session.id, adminSession!.session.id));
    const { getSessionFor } =
      await import("../../src/server/auth/session-policy");
    expect(await getSessionFor(headers)).toBeNull();
  }
} finally {
  await engine.close();
}
