/** Process-isolated PGlite backend. Never import this fixture into the app. */
import { mock } from "bun:test";
import { randomBytes, createHmac } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "../../src/server/db/schema";
import type { LlmAdapter } from "../../src/server/modules/llm";

export function totp(secret: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  const bits = [...secret.toUpperCase().replace(/=+$/, "")]
    .map((char) => alphabet.indexOf(char).toString(2).padStart(5, "0"))
    .join("");
  const key = Buffer.from(
    (bits.match(/.{8}/g) ?? []).map((byte) => parseInt(byte, 2)),
  );
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30_000)));
  const digest = createHmac("sha1", key).update(counter).digest();
  const offset = digest[digest.length - 1]! & 15;
  return ((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000)
    .toString()
    .padStart(6, "0");
}

export async function createMobileBackend(origin = "http://localhost:3100", options: {
  fixtureAi?: boolean;
  liveAi?: { url: string; model: string; username: string; password?: string };
} = {}) {
  const uploads = await mkdtemp(join(tmpdir(), "finfolio-mobile-test-"));
  const setupToken = randomBytes(32).toString("hex");
  // Override sensitive config BEFORE importing env/auth/router modules. No .env writes.
  Object.assign(process.env, {
    NODE_ENV: "development",
    DATABASE_URL: "postgres://127.0.0.1:1/unused_mobile_test_database",
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: randomBytes(32).toString("base64"),
    APP_ENCRYPTION_KEY: randomBytes(32).toString("base64"),
    SETUP_TOKEN: setupToken,
    REQUIRE_TWO_FACTOR: "true",
    DATA_PRESET: "sg",
    UPLOAD_DIR: uploads,
    BACKUP_DIR: join(uploads, "backups"),
    OPENCODE_URL: "http://127.0.0.1:1",
  });
  for (const name of [
    "SKIP_ENV_VALIDATION",
    "SMTP_URL",
    "SMTP_FROM",
    "PRESET_FILE",
    "OPENCODE_SERVER_PASSWORD",
    "BETTER_AUTH_TRUSTED_ORIGINS",
  ])
    delete process.env[name];
  if (options.liveAi) {
    process.env.OPENCODE_URL = options.liveAi.url;
    process.env.OPENCODE_DEFAULT_MODEL = options.liveAi.model;
    process.env.OPENCODE_SERVER_USERNAME = options.liveAi.username;
    if (options.liveAi.password) process.env.OPENCODE_SERVER_PASSWORD = options.liveAi.password;
  }
  const engine = new PGlite();
  const db = drizzle(engine, { schema });
  await mock.module("server-only", () => ({}));
  await mock.module("~/server/db", () => ({ db }));
  const pending = new Set<Promise<unknown>>();
  const next = await import("next/server");
  // Next's after() request lifecycle is supplied only inside this disposable Bun process.
  await mock.module("next/server", () => ({ ...next, after: (callback: () => unknown) => {
    const task = Promise.resolve().then(callback);
    pending.add(task);
    void task.catch(() => undefined).finally(() => pending.delete(task));
  } }));
  if (options.fixtureAi) {
    const llm = await import("../../src/server/modules/llm");
    const { mobileStatement } = await import("./mobile-statement");
    const adapter: LlmAdapter = {
      listModels: async () => [{ id: "fixture/statement", name: "Synthetic extraction fixture" }],
      generateStructured: async (request) => ({ output: request.schema.parse(mobileStatement()), model: "fixture/statement", usage: {} }),
    };
    await mock.module("~/server/modules/llm", () => ({ ...llm, createLlmAdapter: () => adapter }));
  }
  await mock.module("~/server/lib/mailer", () => ({
    isEmailConfigured: () => false,
    trySendMail: async () => null,
  }));
  const journal = (await Bun.file("drizzle/meta/_journal.json").json()) as {
    entries: { tag: string }[];
  };
  for (const { tag } of journal.entries)
    await engine.exec(await Bun.file(`drizzle/${tag}.sql`).text());
  const { loadPresetPack } = await import("../../src/presets");
  const { seedCatalog } = await import("../../src/server/db/seed/catalog");
  // PGlite implements the query/transaction surface used by these real routers.
  await seedCatalog(
    db as unknown as Parameters<typeof seedCatalog>[0],
    await loadPresetPack({ presetId: "sg" }),
  );
  if (options.fixtureAi || options.liveAi) await db.insert(schema.llmProvider).values({
    name: options.fixtureAi ? "Synthetic extraction fixture" : "Live isolated import test",
    kind: "opencode", isDefault: true, isEnabled: true, supportsVision: true,
    baseUrl: options.liveAi?.url ?? "http://127.0.0.1:1", defaultModel: options.liveAi?.model ?? "fixture/statement",
  });
  const { auth } = await import("../../src/server/auth/config");
  const { GET: trpc } = await import("../../src/app/api/trpc/[trpc]/route");
  const { GET: health } = await import("../../src/app/api/health/route");
  const { POST: upload } = await import("../../src/app/api/imports/route");
  const { rm } = await import("node:fs/promises");
  return {
    auth,
    db,
    engine,
    setupToken,
    uploads,
    async fetch(request: Request) {
      const path = new URL(request.url).pathname;
      if (path === "/api/health") return health();
      if (path === "/api/imports" && request.method === "POST") return upload(request);
      if (path.startsWith("/api/auth/")) return auth.handler(request);
      if (path.startsWith("/api/trpc/"))
        return trpc(request as Parameters<typeof trpc>[0]);
      return new Response("Isolated Finfolio mobile test backend", {
        status: 404,
      });
    },
    async close() {
      await Promise.allSettled([...pending]);
      await engine.close();
      await rm(uploads, { recursive: true, force: true });
    },
  };
}

/** Model Expo SecureStore's cookie jar, including clearing challenge/session cookies. */
export class NativeClient {
  cookies = new Map<string, string>();
  constructor(
    readonly backend: Awaited<ReturnType<typeof createMobileBackend>>,
    readonly origin = "http://localhost:3100",
  ) {}
  headers(extra: Record<string, string> = {}) {
    return {
      "expo-origin": "finfolio://",
      cookie: [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; "),
      ...extra,
    };
  }
  async post(path: string, body: unknown, extra: Record<string, string> = {}) {
    const response = await this.backend.auth.handler(
      new Request(`${this.origin}/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", ...this.headers(extra) },
        body: JSON.stringify(body),
      }),
    );
    for (const cookie of response.headers.getSetCookie()) {
      const pair = cookie.split(";")[0]!;
      const at = pair.indexOf("=");
      const name = pair.slice(0, at),
        value = pair.slice(at + 1);
      if (!value) this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
    return response;
  }
}
