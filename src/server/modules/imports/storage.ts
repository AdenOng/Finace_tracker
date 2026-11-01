import "server-only";

import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import { env } from "~/env";

const EXTENSIONS: Record<string, string> = {
  "application/pdf": "pdf",
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

export function sha256(data: Uint8Array) {
  return createHash("sha256").update(data).digest("hex");
}

/** Uploaded statements live under UPLOAD_DIR/<owner>/, outside source control and the database. */
function resolve(storageKey: string) {
  const root = path.resolve(env.UPLOAD_DIR);
  const full = path.resolve(root, storageKey);
  if (!full.startsWith(root + path.sep)) throw new Error("Invalid storage key");
  return full;
}

/**
 * Each attempt gets its own file, so cleaning up a failed attempt can never delete another
 * request's upload of the same bytes. The hash is kept only for duplicate detection.
 */
export async function saveUpload(
  ownerId: string,
  hash: string,
  mimeType: string,
  data: Uint8Array,
) {
  const storageKey = `${ownerId}/${hash}-${randomUUID()}.${EXTENSIONS[mimeType] ?? "bin"}`;
  const full = resolve(storageKey);
  await mkdir(path.dirname(full), { recursive: true, mode: 0o700 });
  try {
    await writeFile(full, data, { mode: 0o600 });
  } catch (error) {
    // Drop a partial file; the write error is the one worth reporting.
    await rm(full, { force: true }).catch(() => undefined);
    throw error;
  }
  return storageKey;
}

export async function readUpload(storageKey: string) {
  return new Uint8Array(await readFile(resolve(storageKey)));
}

export async function removeUpload(storageKey: string) {
  await rm(resolve(storageKey), { force: true });
}
