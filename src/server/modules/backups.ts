import "server-only";

import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "~/env";

/**
 * Backups are made by the compose `backup` service (pg_dump in a postgres image), not by the app:
 * the app image has no pg_dump and no reason to hold superuser-style access. The two talk through
 * files in BACKUP_DIR/control — a heartbeat, an in-progress marker and the last result from the
 * service, and a "run-now" request from the app.
 */
const DUMP_NAME = /^finfolio-\d{8}-\d{6}\.dump$/;
const HEARTBEAT_STALE_MS = 5 * 60_000;

const root = () => path.resolve(env.BACKUP_DIR);
const control = (name: string) => path.join(root(), "control", name);

export function isBackupName(name: string) {
  return DUMP_NAME.test(name);
}

/** Absolute path of a dump, or null for anything that is not one of ours. */
export function backupPath(name: string) {
  return isBackupName(name) ? path.join(root(), name) : null;
}

async function readText(file: string) {
  try {
    return (await readFile(file, "utf8")).trim();
  } catch {
    return null;
  }
}

async function mtime(file: string) {
  try {
    return (await stat(file)).mtime;
  } catch {
    return null;
  }
}

export async function listBackups() {
  let names: string[];
  try {
    names = await readdir(root());
  } catch {
    return { available: false as const, backups: [] };
  }
  const backups = await Promise.all(
    names.filter(isBackupName).map(async (name) => {
      const info = await stat(path.join(root(), name));
      return { name, sizeBytes: info.size, createdAt: info.mtime };
    }),
  );
  backups.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return { available: true as const, backups };
}

export async function backupServiceStatus() {
  const [heartbeat, lastRun, lastError, requestedAt, inProgressSince] =
    await Promise.all([
      mtime(control("heartbeat")),
      readText(control("last-run")),
      readText(control("last-error")),
      mtime(control("run-now")),
      mtime(control("in-progress")),
    ]);
  // "ok 2026-10-20T01:00:00Z finfolio-….dump" or "failed 2026-10-20T01:00:00Z"
  const [outcome, at] = lastRun?.split(" ") ?? [];
  return {
    running:
      !!heartbeat && Date.now() - heartbeat.getTime() < HEARTBEAT_STALE_MS,
    heartbeat,
    lastRun: lastRun
      ? {
          ok: outcome === "ok",
          at: at ? new Date(at) : null,
          error: outcome === "ok" ? null : (lastError?.slice(0, 400) ?? null),
        }
      : null,
    requestedAt,
    /** Set while pg_dump runs; the service writes it before clearing `run-now`. */
    inProgressSince,
    retentionDays: env.BACKUP_RETENTION_DAYS,
    directory: env.BACKUP_DIR,
  };
}

/** Asks the backup service for a dump at its next check (within a minute). */
export async function requestBackup() {
  await mkdir(path.dirname(control("run-now")), { recursive: true });
  await writeFile(control("run-now"), new Date().toISOString());
}
