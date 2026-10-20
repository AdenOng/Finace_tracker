import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq } from "drizzle-orm";

import type { Database } from "../src/server/db";
import * as schema from "../src/server/db/schema";

const engine = new PGlite();
const db = drizzle(engine, { schema });
// Only the auth/connection boundary is replaced. Tests run real routers, queries and migrations.
await mock.module("server-only", () => ({}));
await mock.module("~/server/db", () => ({ db }));
await mock.module("~/server/auth/config", () => ({
  auth: {
    api: { getSession: async () => null },
    $context: Promise.resolve({
      password: {
        hash: async (password: string) => `synthetic-hash:${password}`,
        config: { minPasswordLength: 10, maxPasswordLength: 128 },
      },
    }),
  },
}));
const { adminRouter } = await import("../src/server/api/routers/admin");
const { consumePasswordReset, findPendingPasswordReset } =
  await import("../src/server/auth/password-reset");

const admin = adminRouter.createCaller({
  db: db as unknown as Database,
  headers: new Headers(),
  session: {
    session: {
      id: "admin-session",
      userId: "admin",
      token: "synthetic-admin-token",
      expiresAt: new Date(Date.now() + 60_000),
      createdAt: new Date(),
      updatedAt: new Date(),
      ipAddress: null,
      userAgent: null,
      impersonatedBy: null,
    },
    user: {
      id: "admin",
      name: "Example Admin",
      email: "admin@example.com",
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
      image: null,
      role: "admin",
      banned: false,
      banReason: null,
      banExpires: null,
      twoFactorEnabled: true,
    },
  },
});

const inAnHour = () => new Date(Date.now() + 3_600_000);
const tokenFrom = (url: string) => url.split("/").at(-1)!;

beforeAll(async () => {
  const journal = (await Bun.file(
    new URL("../drizzle/meta/_journal.json", import.meta.url),
  ).json()) as { entries: { tag: string }[] };
  for (const { tag } of journal.entries) {
    await engine.exec(
      await Bun.file(new URL(`../drizzle/${tag}.sql`, import.meta.url)).text(),
    );
  }
}, 30_000);
beforeEach(async () => {
  await engine.exec(
    'TRUNCATE TABLE "user", llm_provider, audit_log, invitation CASCADE',
  );
  await db.insert(schema.user).values([
    {
      id: "admin",
      name: "Example Admin",
      email: "admin@example.com",
      role: "admin",
      twoFactorEnabled: true,
    },
    {
      id: "member",
      name: "Example Member",
      email: "member@example.com",
      twoFactorEnabled: true,
    },
  ]);
  await db.insert(schema.session).values([
    {
      id: "member-session",
      userId: "member",
      token: "synthetic-member-token",
      expiresAt: inAnHour(),
      userAgent: "Mozilla/5.0 (Macintosh; Mac OS X) Chrome/140",
    },
    {
      id: "admin-session",
      userId: "admin",
      token: "synthetic-admin-token",
      expiresAt: inAnHour(),
    },
  ]);
  await db.insert(schema.account).values({
    id: "member-credential",
    userId: "member",
    accountId: "member",
    providerId: "credential",
    password: "synthetic-old-hash",
  });
  await db.insert(schema.twoFactor).values({
    id: "member-2fa",
    userId: "member",
    secret: "synthetic-secret",
    backupCodes: "synthetic-codes",
  });
});
afterAll(async () => {
  await engine.close();
});

async function auditActions() {
  return (await db.select().from(schema.auditLog)).map((row) => row.action);
}

describe("account recovery", () => {
  test("sessions list never exposes tokens and can be revoked", async () => {
    const sessions = await admin.users.sessions({ userId: "member" });
    expect(sessions).toHaveLength(1);
    expect(JSON.stringify(sessions)).not.toContain("synthetic-member-token");

    expect(await admin.users.revokeSessions({ userId: "member" })).toEqual({
      revoked: 1,
    });
    expect(await admin.users.sessions({ userId: "member" })).toHaveLength(0);
    // The admin's own session is untouched.
    expect(await db.$count(schema.session)).toBe(1);
    expect(await auditActions()).toEqual(["user.sessions_revoked"]);
  });

  test("resetting two-step removes the secret, clears the flag and signs out", async () => {
    await admin.users.resetTwoFactor({ userId: "member" });
    expect(await db.$count(schema.twoFactor)).toBe(0);
    const [member] = await db
      .select()
      .from(schema.user)
      .where(eq(schema.user.id, "member"));
    expect(member?.twoFactorEnabled).toBe(false);
    expect(
      await db.$count(schema.session, eq(schema.session.userId, "member")),
    ).toBe(0);
    expect(await auditActions()).toEqual(["user.two_factor_reset"]);
  });

  test("admins cannot run recovery actions on themselves", async () => {
    for (const action of [
      admin.users.resetTwoFactor,
      admin.users.revokeSessions,
      admin.users.createPasswordReset,
    ]) {
      await expect(action({ userId: "admin" })).rejects.toMatchObject({
        code: "BAD_REQUEST",
      });
    }
    await expect(
      admin.users.resetTwoFactor({ userId: "missing" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  test("a reset link works once, replaces older links and signs the user out", async () => {
    const first = await admin.users.createPasswordReset({ userId: "member" });
    const second = await admin.users.createPasswordReset({ userId: "member" });
    const stored = await db.select().from(schema.passwordReset);
    expect(JSON.stringify(stored)).not.toContain(tokenFrom(second.url));
    expect(
      await findPendingPasswordReset(db as never, tokenFrom(first.url)),
    ).toBeNull();

    await expect(
      consumePasswordReset(db as never, tokenFrom(second.url), "short"),
    ).rejects.toThrow("between 10 and 128");
    await consumePasswordReset(
      db as never,
      tokenFrom(second.url),
      "a-new-long-password",
    );
    const [credential] = await db
      .select()
      .from(schema.account)
      .where(eq(schema.account.userId, "member"));
    expect(credential?.password).toBe("synthetic-hash:a-new-long-password");
    expect(
      await db.$count(schema.session, eq(schema.session.userId, "member")),
    ).toBe(0);
    await expect(
      consumePasswordReset(
        db as never,
        tokenFrom(second.url),
        "another-password",
      ),
    ).rejects.toThrow("no longer works");
    expect(await auditActions()).toEqual([
      "user.password_reset_created",
      "user.password_reset_created",
      "user.password_reset_used",
    ]);
  });

  test("expired reset links are rejected", async () => {
    const { url } = await admin.users.createPasswordReset({ userId: "member" });
    await db
      .update(schema.passwordReset)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(schema.passwordReset.userId, "member"));
    await expect(
      consumePasswordReset(db as never, tokenFrom(url), "a-new-long-password"),
    ).rejects.toThrow("no longer works");
  });
});

describe("invitations", () => {
  test("re-inviting an email replaces its pending link", async () => {
    await admin.users.invite({ email: "new@example.com", role: "user" });
    await admin.users.invite({ email: "New@Example.com", role: "admin" });
    const pending = await admin.users.invitations();
    expect(pending).toHaveLength(1);
    expect(pending[0]?.role).toBe("admin");

    await admin.users.revokeInvite({ id: pending[0]!.id });
    await expect(
      admin.users.revokeInvite({ id: pending[0]!.id }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

const providerValues = {
  name: "Test provider",
  kind: "openai_compatible" as const,
  baseUrl: "http://localhost:4096",
  defaultModel: "test-model",
  supportsVision: true,
  isEnabled: true,
};

describe("default AI provider", () => {
  test("cannot be disabled", async () => {
    const created = await admin.ai.create(providerValues);
    await expect(
      admin.ai.update({ ...providerValues, id: created!.id, isEnabled: false }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  test("deleting it promotes the oldest enabled provider", async () => {
    const first = await admin.ai.create({ ...providerValues, name: "First" });
    await admin.ai.create({
      ...providerValues,
      name: "Disabled",
      isEnabled: false,
    });
    const third = await admin.ai.create({ ...providerValues, name: "Third" });

    expect(await admin.ai.remove({ id: first!.id })).toEqual({
      promoted: { id: third!.id, name: "Third" },
    });
    const defaults = (await admin.ai.list()).filter((p) => p.isDefault);
    expect(defaults.map((p) => p.name)).toEqual(["Third"]);
  });
});

describe("overview and audit log", () => {
  test("failed jobs expose metadata but not documents or extracted data", async () => {
    const [doc] = await db
      .insert(schema.document)
      .values({
        ownerId: "member",
        fileName: "synthetic-private-statement.pdf",
        mimeType: "application/pdf",
        sizeBytes: 10,
        sha256: "synthetic-sha",
        storageKey: "synthetic-key",
      })
      .returning();
    const [failedJob] = await db
      .insert(schema.extractionJob)
      .values({
        ownerId: "member",
        documentId: doc!.id,
        status: "failed",
        result: { secret: "synthetic-private-balance" },
        error: "x".repeat(500),
      })
      .returning();
    await db.insert(schema.llmUsage).values({
      jobId: failedJob!.id,
      inputTokens: 100,
      outputTokens: 20,
    });

    const { items: failed } = await admin.jobs.list({ filter: "failed" });
    expect(failed).toHaveLength(1);
    expect(failed[0]?.ownerName).toBe("Example Member");
    expect(failed[0]?.error?.length).toBeLessThan(250);
    const body = JSON.stringify(failed);
    expect(body).not.toContain("synthetic-private");

    const stats = await admin.overview.stats();
    expect(stats.users).toEqual({
      total: 2,
      admins: 1,
      disabled: 0,
      twoFactor: 2,
    });
    expect(stats.jobsByStatus).toEqual([{ status: "failed", count: 1 }]);
    expect(stats.usage[0]).toMatchObject({
      inputTokens: 100,
      outputTokens: 20,
    });
    expect(stats.defaultProvider).toBeNull();
  });

  test("audit entries are filterable and paginated", async () => {
    await admin.ai.create(providerValues);
    for (let i = 0; i < 55; i++) {
      await db.insert(schema.auditLog).values({
        actorId: "admin",
        action: "category.created",
        targetType: "category",
        targetLabel: `Category ${i}`,
        createdAt: new Date(Date.now() - (i + 1) * 1000),
      });
    }
    const providers = await admin.audit.list({ targetType: "provider" });
    expect(providers.items.map((e) => e.action)).toEqual(["provider.created"]);
    expect(providers.items[0]?.actorName).toBe("Example Admin");

    const page1 = await admin.audit.list({});
    expect(page1.items).toHaveLength(50);
    const page2 = await admin.audit.list({ cursor: page1.nextCursor });
    expect(page2.items).toHaveLength(6);
    expect(page2.nextCursor).toBeNull();
  });
});
