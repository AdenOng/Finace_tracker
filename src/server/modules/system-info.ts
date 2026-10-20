import "server-only";

import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";

import { sql } from "drizzle-orm";

import { env } from "~/env";
import type { Database } from "~/server/db";
import {
  document,
  financialAccount,
  transaction,
  user,
} from "~/server/db/schema";
import { isEmailConfigured } from "~/server/lib/mailer";

/** When this Node process started, not when this module was first loaded. */
const startedAt = () => new Date(Date.now() - process.uptime() * 1000);

/** Total size of the files under `dir`, stopping after `limit` entries. */
async function directorySize(dir: string, limit = 20_000) {
  let bytes = 0;
  let files = 0;
  const walk = async (current: string): Promise<void> => {
    let entries;
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (files >= limit) return;
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (entry.isFile()) {
        files++;
        bytes += (await stat(full).catch(() => ({ size: 0 }))).size;
      }
    }
  };
  await walk(path.resolve(dir));
  return { bytes, files, truncated: files >= limit };
}

async function appVersion() {
  try {
    const pkg = JSON.parse(
      await readFile(path.join(process.cwd(), "package.json"), "utf8"),
    ) as { version?: string };
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}

async function migrationStatus(db: Database) {
  let expected: string[] = [];
  try {
    const journal = JSON.parse(
      await readFile(
        path.join(process.cwd(), "drizzle", "meta", "_journal.json"),
        "utf8",
      ),
    ) as { entries: { tag: string }[] };
    expected = journal.entries.map((e) => e.tag);
  } catch {
    // Missing journal: reported as unknown below.
  }
  try {
    const rows = await db.execute<{ applied: number; latest: string | null }>(
      sql`select count(*)::int as applied, max(created_at)::text as latest from drizzle.__drizzle_migrations`,
    );
    const row = rows[0];
    return {
      expected: expected.length,
      applied: row?.applied ?? 0,
      latestTag: expected.at(-1) ?? null,
      appliedAt: row?.latest ? new Date(Number(row.latest)) : null,
    };
  } catch {
    return {
      expected: expected.length,
      applied: null,
      latestTag: expected.at(-1) ?? null,
      appliedAt: null,
    };
  }
}

function smtpHost() {
  if (!env.SMTP_URL) return null;
  try {
    return new URL(env.SMTP_URL).host;
  } catch {
    return "unreadable SMTP_URL";
  }
}

/** Instance facts for Admin → System. Never includes secrets, only whether they are set. */
export async function systemInfo(db: Database) {
  const [database] = await db.execute<{
    version: string;
    size: string;
  }>(
    sql`select current_setting('server_version') as version, pg_database_size(current_database())::text as size`,
  );
  const [counts] = await db
    .select({
      users: sql<number>`(select count(*)::int from ${user})`,
      accounts: sql<number>`(select count(*)::int from ${financialAccount})`,
      transactions: sql<number>`(select count(*)::int from ${transaction})`,
      documents: sql<number>`(select count(*)::int from ${document})`,
    })
    .from(sql`(select 1) as one`);
  const [uploads, backups, version, migrations] = await Promise.all([
    directorySize(env.UPLOAD_DIR),
    directorySize(env.BACKUP_DIR),
    appVersion(),
    migrationStatus(db),
  ]);
  return {
    app: {
      version,
      node: process.version,
      platform: `${process.platform} ${process.arch}`,
      startedAt: startedAt(),
      environment: env.NODE_ENV,
    },
    database: {
      version: database?.version ?? "unknown",
      sizeBytes: Number(database?.size ?? 0),
      counts: counts ?? {
        users: 0,
        accounts: 0,
        transactions: 0,
        documents: 0,
      },
      migrations,
    },
    storage: {
      uploads: { ...uploads, directory: env.UPLOAD_DIR },
      backups: { ...backups, directory: env.BACKUP_DIR },
    },
    config: {
      baseUrl: env.BETTER_AUTH_URL,
      preset: env.PRESET_FILE
        ? `File: ${env.PRESET_FILE}`
        : `Built-in: ${env.DATA_PRESET}`,
      requireTwoFactor: env.REQUIRE_TWO_FACTOR,
      encryptionKeySet: !!env.APP_ENCRYPTION_KEY,
      opencodeUrl: env.OPENCODE_URL,
      opencodePasswordSet: !!env.OPENCODE_SERVER_PASSWORD,
      email: { configured: isEmailConfigured(), host: smtpHost() },
    },
  };
}
