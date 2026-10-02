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
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import type { Database } from "../src/server/db";
import * as schema from "../src/server/db/schema";

const engine = new PGlite();
const db = drizzle(engine, { schema });
// Only the auth/connection boundary is replaced. Tests run real routers, queries and migrations.
await mock.module("server-only", () => ({}));
await mock.module("~/server/db", () => ({ db }));
await mock.module("~/server/auth/config", () => ({
  auth: { api: { getSession: async () => null } },
}));
const { adminAiRouter } = await import("../src/server/api/routers/admin/ai");
const { adminCategoriesRouter } =
  await import("../src/server/api/routers/admin/categories");

const context = {
  db: db as unknown as Database,
  headers: new Headers(),
  session: {
    session: {
      id: "test-session",
      userId: "admin",
      token: "synthetic-session-token",
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
};
const ai = adminAiRouter.createCaller(context);
const categories = adminCategoriesRouter.createCaller(context);

test("internal HTTP errors expose neither private messages nor development stacks", async () => {
  const { createTRPCRouter, publicProcedure } =
    await import("../src/server/api/trpc");
  const router = createTRPCRouter({
    failure: publicProcedure.query(() => {
      throw new Error("synthetic-private-database-value");
    }),
  });
  const response = await fetchRequestHandler({
    endpoint: "/api/trpc",
    req: new Request("http://localhost/api/trpc/failure"),
    router,
    createContext: () => context,
  });
  expect(response.status).toBe(500);
  const body = await response.text();
  expect(body).not.toContain("synthetic-private-database-value");
  expect(body).toContain("The request could not be completed");
});

beforeAll(async () => {
  for (const file of [
    "0000_shallow_blizzard.sql",
    "0001_admin_bootstrap.sql",
  ]) {
    await engine.exec(
      await Bun.file(new URL(`../drizzle/${file}`, import.meta.url)).text(),
    );
  }
  await db.insert(schema.user).values({
    id: "private-owner",
    name: "Example User",
    email: "user@example.com",
  });
}, 30_000);
beforeEach(async () => {
  await engine.exec("TRUNCATE TABLE llm_provider, category CASCADE");
});
afterAll(async () => {
  await engine.close();
});

const providerValues = {
  name: "Test provider",
  kind: "openai_compatible" as const,
  baseUrl: "http://localhost:4096",
  defaultModel: "test-model",
  supportsVision: true,
  isEnabled: true,
};

describe("admin provider ownership", () => {
  test("private providers cannot be updated, removed, tested or made the default", async () => {
    const [platform] = await db
      .insert(schema.llmProvider)
      .values({ ...providerValues, isDefault: true })
      .returning();
    const [privateProvider] = await db
      .insert(schema.llmProvider)
      .values({ ...providerValues, ownerId: "private-owner" })
      .returning();
    const id = privateProvider!.id;
    await expect(ai.update({ ...providerValues, id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(ai.remove({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(ai.models({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(ai.test({ id })).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(ai.setDefault({ id })).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const rows = await db.select().from(schema.llmProvider);
    expect(rows).toHaveLength(2);
    expect(rows.find((row) => row.id === platform!.id)?.isDefault).toBe(true);
    expect(await ai.list()).toHaveLength(1);
  });
  test("shared credentials are encrypted and never included in list responses", async () => {
    const credential = "synthetic-provider-credential";
    const created = await ai.create({ ...providerValues, apiKey: credential });
    const [stored] = await db
      .select()
      .from(schema.llmProvider)
      .where(eq(schema.llmProvider.id, created!.id));
    expect(stored!.apiKeyEncrypted).toStartWith("v1.");
    expect(stored!.apiKeyEncrypted).not.toContain(credential);
    const [listed] = await ai.list();
    expect(listed).not.toHaveProperty("apiKeyEncrypted");
    expect(JSON.stringify(listed)).not.toContain(credential);
    await ai.update({ ...providerValues, id: created!.id, apiKey: null });
    expect((await ai.list())[0]?.apiKeyPreview).toBeNull();
  });
  test("regular users and admins without required 2FA cannot access admin providers", async () => {
    const regularUser = adminAiRouter.createCaller({
      ...context,
      session: {
        ...context.session,
        user: { ...context.session.user, role: "user" },
      },
    });
    const unenrolledAdmin = adminAiRouter.createCaller({
      ...context,
      session: {
        ...context.session,
        user: { ...context.session.user, twoFactorEnabled: false },
      },
    });
    await expect(regularUser.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(unenrolledAdmin.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("category tree integrity", () => {
  const values = {
    name: "Test category",
    kind: "expense" as const,
    color: null,
    aiHint: null,
  };
  test("updates cannot introduce cycles or a third nesting level", async () => {
    const parent = await categories.create({ ...values, parentId: null });
    const child = await categories.create({ ...values, parentId: parent!.id });
    await expect(
      categories.update({ ...values, id: parent!.id, parentId: child!.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      categories.update({ ...values, id: child!.id, parentId: child!.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      categories.create({ ...values, parentId: child!.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
  test("archived categories cannot be parents or reassignment destinations", async () => {
    const archived = await categories.create({ ...values, parentId: null });
    const active = await categories.create({ ...values, parentId: null });
    await categories.archive({ id: archived!.id, reassignToId: null });
    await expect(
      categories.create({ ...values, parentId: archived!.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      categories.archive({ id: active!.id, reassignToId: archived!.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const [row] = await db
      .select()
      .from(schema.category)
      .where(eq(schema.category.id, active!.id));
    expect(row!.archivedAt).toBeNull();
  });
});
