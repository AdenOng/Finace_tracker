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
const scheduled: (() => unknown)[] = [];
const nextServer = await import("next/server");
// Only the auth/connection boundary is replaced, plus `after` so background work can be observed.
await mock.module("server-only", () => ({}));
await mock.module("~/server/db", () => ({ db }));
await mock.module("~/server/auth/config", () => ({
  auth: { api: { getSession: async () => null } },
}));
await mock.module("next/server", () => ({
  ...nextServer,
  after: (fn: () => unknown) => void scheduled.push(fn),
}));
const { adminRouter } = await import("../src/server/api/routers/admin");
const { importProviders } = await import("../src/server/modules/llm/routing");
const { purgeOldDocuments, retentionPreview } =
  await import("../src/server/modules/imports/retention");
const { setCachedInstanceSettings, DEFAULT_INSTANCE_SETTINGS } =
  await import("../src/server/lib/instance-settings-cache");

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

const DAY = 86_400_000;
const providerValues = {
  name: "Primary",
  kind: "openai_compatible" as const,
  baseUrl: "http://localhost:4096/v1",
  defaultModel: "test-model",
  supportsVision: true,
  isEnabled: true,
};

async function insertJob(
  values: Partial<typeof schema.extractionJob.$inferInsert> = {},
) {
  const [doc] = await db
    .insert(schema.document)
    .values({
      ownerId: "member",
      fileName: "synthetic-private-statement.pdf",
      mimeType: "application/pdf",
      sizeBytes: 2048,
      sha256: crypto.randomUUID(),
      storageKey: `member/${crypto.randomUUID()}.pdf`,
    })
    .returning();
  const [job] = await db
    .insert(schema.extractionJob)
    .values({ ownerId: "member", documentId: doc!.id, ...values })
    .returning();
  return { doc: doc!, job: job! };
}

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
  scheduled.length = 0;
  setCachedInstanceSettings(DEFAULT_INSTANCE_SETTINGS);
  await engine.exec(
    'TRUNCATE TABLE "user", llm_provider, audit_log, category, institution, instance_settings CASCADE',
  );
  await db.insert(schema.user).values([
    {
      id: "admin",
      name: "Example Admin",
      email: "admin@example.com",
      role: "admin",
      twoFactorEnabled: true,
    },
    { id: "member", name: "Example Member", email: "member@example.com" },
  ]);
});
afterAll(async () => {
  // The settings cache lives on globalThis; leave it as other test files expect.
  setCachedInstanceSettings(DEFAULT_INSTANCE_SETTINGS);
  await engine.close();
});

describe("import jobs", () => {
  test("a running read can be stopped once, then retried", async () => {
    const { job } = await insertJob({
      status: "running",
      startedAt: new Date(),
    });
    await admin.jobs.cancel({ id: job.id });
    const [stopped] = await db
      .select()
      .from(schema.extractionJob)
      .where(eq(schema.extractionJob.id, job.id));
    expect(stopped?.status).toBe("failed");
    await expect(admin.jobs.cancel({ id: job.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    await admin.jobs.retry({ id: job.id });
    const [queued] = await db
      .select()
      .from(schema.extractionJob)
      .where(eq(schema.extractionJob.id, job.id));
    expect(queued?.status).toBe("queued");
    expect(scheduled).toHaveLength(1);
    const actions = await db
      .select({ action: schema.auditLog.action })
      .from(schema.auditLog);
    expect(actions.map((a) => a.action).sort()).toEqual([
      "job.cancelled",
      "job.retried",
    ]);
  });

  test("finished imports cannot be retried and stuck ones are flagged", async () => {
    const { job: done } = await insertJob({ status: "completed" });
    await expect(admin.jobs.retry({ id: done.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });
    await insertJob({
      status: "running",
      startedAt: new Date(Date.now() - 10 * 60_000),
    });
    const counts = await admin.jobs.counts();
    expect(counts.stuck).toBe(1);
    const { items } = await admin.jobs.list({ filter: "stuck" });
    expect(items).toHaveLength(1);
    expect(items[0]?.stale).toBe(true);
    expect(JSON.stringify(items)).not.toContain("synthetic-private");
  });
});

describe("provider routing", () => {
  test("a provider paused at its monthly limit hands imports to the fallback", async () => {
    const primary = await admin.ai.create({
      ...providerValues,
      monthlyTokenLimit: 1000,
      pauseAtLimit: true,
    });
    const backup = await admin.ai.create({ ...providerValues, name: "Backup" });
    const { job: spent } = await insertJob({ status: "completed" });
    await db.insert(schema.llmUsage).values({
      providerId: primary!.id,
      jobId: spent.id,
      inputTokens: 900,
      outputTokens: 200,
    });
    // Deleting the import must not hand the spent tokens back.
    await db
      .delete(schema.document)
      .where(eq(schema.document.ownerId, "member"));

    await expect(importProviders(db as unknown as Database)).rejects.toThrow(
      /monthly token limit/,
    );

    await admin.ai.setFallback({ id: backup!.id });
    const providers = await importProviders(db as unknown as Database);
    expect(providers.map((p) => p.provider.name)).toEqual(["Backup"]);

    const list = await admin.ai.list();
    expect(list.find((p) => p.id === primary!.id)).toMatchObject({
      tokensThisMonth: 1100,
      limitReached: true,
    });
    expect(list.find((p) => p.id === backup!.id)?.isFallback).toBe(true);
  });

  test("the default cannot be its own fallback", async () => {
    const primary = await admin.ai.create(providerValues);
    await expect(
      admin.ai.setFallback({ id: primary!.id }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("security settings", () => {
  test("are stored, cached and audited with only what changed", async () => {
    await admin.security.updateSettings({
      twoFactorPolicy: "off",
      maxSessionDays: 14,
      workspaceInviteSignups: false,
      newDeviceAlerts: true,
    });
    const settings = await admin.security.settings();
    expect(settings).toMatchObject({
      maxSessionDays: 14,
      workspaceInviteSignups: false,
      // Tests run with REQUIRE_TWO_FACTOR=true, which the console cannot lower.
      twoFactorPolicy: "everyone",
      twoFactorForcedByEnv: true,
    });
    const [entry] = await db.select().from(schema.auditLog);
    expect(entry?.details).toEqual({
      maxSessionDays: 14,
      workspaceInviteSignups: false,
    });
    await expect(
      admin.security.updateSettings({
        twoFactorPolicy: "off",
        maxSessionDays: 0,
        workspaceInviteSignups: true,
        newDeviceAlerts: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("category import and order", () => {
  const rows = [
    { key: "pets", name: "Pets", kind: "expense" as const },
    // Declared as income, but a subcategory always takes its parent's type.
    {
      key: "pets.vet",
      name: "Vet",
      kind: "income" as const,
      parentKey: "pets",
    },
  ];

  test("a dry run writes nothing; applying creates the tree", async () => {
    const preview = await admin.categories.importJson({ rows, dryRun: true });
    expect(preview).toEqual({
      created: 2,
      updated: 0,
      unchanged: 0,
      archivedWithParent: 0,
    });
    expect(await db.$count(schema.category)).toBe(0);

    await admin.categories.importJson({ rows, dryRun: false });
    const all = await db.select().from(schema.category);
    const pets = all.find((c) => c.key === "pets");
    expect(all.find((c) => c.key === "pets.vet")).toMatchObject({
      parentId: pets!.id,
      kind: "expense",
    });
    expect(await admin.categories.importJson({ rows, dryRun: true })).toEqual({
      created: 0,
      updated: 0,
      unchanged: 2,
      archivedWithParent: 0,
    });
  });

  test("subcategories are archived along with an archived parent", async () => {
    await admin.categories.importJson({
      rows: [
        ...rows,
        {
          key: "pets.food",
          name: "Pet food",
          kind: "expense",
          parentKey: "pets",
        },
      ],
      dryRun: false,
    });
    // The file archives the parent, leaves "Vet" active and does not mention "Pet food".
    const result = await admin.categories.importJson({
      rows: [{ ...rows[0]!, archived: true }, rows[1]!],
      dryRun: false,
    });
    expect(result.archivedWithParent).toBe(2);
    const all = await db.select().from(schema.category);
    expect(all.filter((c) => !c.archivedAt)).toHaveLength(0);
  });

  test("rejects a third level and reorders siblings only", async () => {
    await expect(
      admin.categories.importJson({
        rows: [
          ...rows,
          {
            key: "pets.vet.dental",
            name: "Dental",
            kind: "expense",
            parentKey: "pets.vet",
          },
        ],
        dryRun: true,
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });

    await admin.categories.importJson({
      rows: [...rows, { key: "travel", name: "Travel", kind: "expense" }],
      dryRun: false,
    });
    const all = await db.select().from(schema.category);
    const id = (key: string) => all.find((c) => c.key === key)!.id;
    await admin.categories.reorder({ ids: [id("travel"), id("pets")] });
    const ordered = await admin.categories.list();
    expect(ordered.filter((c) => !c.parentId).map((c) => c.key)).toEqual([
      "travel",
      "pets",
    ]);
    await expect(
      admin.categories.reorder({ ids: [id("travel"), id("pets.vet")] }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("institution merge", () => {
  test("moves accounts to the target and removes a custom duplicate", async () => {
    const [source, target] = await db
      .insert(schema.institution)
      .values([
        { key: "dbs_copy", name: "DBS (copy)", kind: "bank" },
        { key: "dbs", name: "DBS", kind: "bank", isSystem: true },
      ])
      .returning();
    await db.insert(schema.financialAccount).values({
      ownerId: "member",
      name: "Savings",
      type: "savings",
      institutionId: source!.id,
    });
    const result = await admin.institutions.merge({
      sourceId: source!.id,
      targetId: target!.id,
    });
    expect(result).toEqual({ accountsMoved: 1, sourceArchived: false });
    const [account] = await db.select().from(schema.financialAccount);
    expect(account?.institutionId).toBe(target!.id);
    expect(await db.$count(schema.institution)).toBe(1);
  });
});

describe("statement file retention", () => {
  test("only removes files whose imports finished before the cutoff", async () => {
    const old = new Date(Date.now() - 40 * DAY);
    const { doc: finished } = await insertJob({
      status: "completed",
      updatedAt: old,
    });
    await insertJob({ status: "failed", updatedAt: old });
    await insertJob({ status: "completed" });

    expect(await retentionPreview(db as unknown as Database, 30)).toEqual({
      files: 1,
      bytes: 2048,
    });
    const result = await purgeOldDocuments(db as unknown as Database, 30);
    expect(result.files).toBe(1);
    const [purged] = await db
      .select()
      .from(schema.document)
      .where(eq(schema.document.id, finished.id));
    expect(purged?.filePurgedAt).toBeInstanceOf(Date);
    expect(await retentionPreview(db as unknown as Database, 30)).toEqual({
      files: 0,
      bytes: 0,
    });
  });
});

describe("activity log filters", () => {
  test("filter by person, text and date", async () => {
    await db.insert(schema.auditLog).values([
      {
        actorId: "admin",
        action: "category.created",
        targetType: "category",
        targetLabel: "Groceries",
        createdAt: new Date("2026-03-01T10:00:00Z"),
      },
      {
        actorId: "member",
        action: "workspace.create",
        targetType: "workspace",
        targetLabel: "Family",
        createdAt: new Date("2026-03-05T10:00:00Z"),
      },
    ]);
    const byActor = await admin.audit.list({ actorId: "member" });
    expect(byActor.items.map((e) => e.targetLabel)).toEqual(["Family"]);
    const byText = await admin.audit.list({ query: "grocer" });
    expect(byText.items.map((e) => e.targetLabel)).toEqual(["Groceries"]);
    const byDate = await admin.audit.list({
      from: "2026-03-02",
      to: "2026-03-05",
    });
    expect(byDate.items.map((e) => e.targetLabel)).toEqual(["Family"]);
    const actors = await admin.audit.actors();
    expect(actors.map((a) => a.id).sort()).toEqual(["admin", "member"]);
  });
});

describe("invitations", () => {
  test("recently expired invites are listed as expired", async () => {
    await db.insert(schema.invitation).values({
      id: "old-invite",
      email: "late@example.com",
      tokenHash: "synthetic-hash",
      expiresAt: new Date(Date.now() - DAY),
    });
    const [invite] = await admin.users.invitations();
    expect(invite).toMatchObject({ email: "late@example.com", expired: true });
  });
});

describe("list counts", () => {
  test("correlated counts and last-active refer to the listed row", async () => {
    await db.insert(schema.session).values({
      id: "member-session",
      userId: "member",
      token: "synthetic-member-token",
      expiresAt: new Date(Date.now() + DAY),
    });
    const users = await admin.users.list();
    expect(users.find((u) => u.id === "member")?.lastActiveAt).toBeInstanceOf(
      Date,
    );
    expect(users.find((u) => u.id === "admin")?.lastActiveAt).toBeNull();

    const [bank] = await db
      .insert(schema.institution)
      .values({ key: "ocbc", name: "OCBC", kind: "bank" })
      .returning();
    await db.insert(schema.financialAccount).values({
      ownerId: "member",
      name: "Savings",
      type: "savings",
      institutionId: bank!.id,
    });
    const institutions = await admin.institutions.list();
    expect(institutions[0]).toMatchObject({
      accountCount: 1,
      documentCount: 0,
    });
  });
});
