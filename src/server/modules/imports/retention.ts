import "server-only";

import { and, inArray, isNull, sql } from "drizzle-orm";

import type { Database } from "~/server/db";
import { document, extractionJob } from "~/server/db/schema";
import { removeUpload } from "./storage";

const DAY_MS = 86_400_000;

/**
 * Stored files whose imports are all finished (completed or cancelled) and untouched for `days`.
 * Failed, queued and in-review imports keep their file so they can still be read again.
 */
function eligible(days: number) {
  // A string, not a Date: the postgres-js driver only takes timestamp parameters as strings.
  const cutoff = new Date(Date.now() - days * DAY_MS).toISOString();
  return and(
    isNull(document.filePurgedAt),
    sql`exists (select 1 from ${extractionJob} where ${extractionJob.documentId} = ${document.id})`,
    sql`not exists (
      select 1 from ${extractionJob}
      where ${extractionJob.documentId} = ${document.id}
        and (${extractionJob.status} not in ('completed', 'cancelled')
          or ${extractionJob.updatedAt} > ${cutoff}::timestamptz)
    )`,
  );
}

export async function storageStats(db: Pick<Database, "select">) {
  const [row] = await db
    .select({
      files: sql<number>`count(*) filter (where ${document.filePurgedAt} is null)::int`,
      bytes:
        sql<number>`coalesce(sum(${document.sizeBytes}) filter (where ${document.filePurgedAt} is null), 0)::bigint`.mapWith(
          Number,
        ),
      purged: sql<number>`count(*) filter (where ${document.filePurgedAt} is not null)::int`,
    })
    .from(document);
  return row ?? { files: 0, bytes: 0, purged: 0 };
}

export async function retentionPreview(
  db: Pick<Database, "select">,
  days: number,
) {
  const [row] = await db
    .select({
      files: sql<number>`count(*)::int`,
      bytes:
        sql<number>`coalesce(sum(${document.sizeBytes}), 0)::bigint`.mapWith(
          Number,
        ),
    })
    .from(document)
    .where(eligible(days));
  return row ?? { files: 0, bytes: 0 };
}

/** Deletes eligible files from disk and marks their documents; rows stay for duplicate checks. */
export async function purgeOldDocuments(
  db: Pick<Database, "select" | "update">,
  days: number,
) {
  const rows = await db
    .select({
      id: document.id,
      storageKey: document.storageKey,
      sizeBytes: document.sizeBytes,
    })
    .from(document)
    .where(eligible(days))
    .limit(500);
  let bytes = 0;
  const purged: string[] = [];
  for (const row of rows) {
    try {
      await removeUpload(row.storageKey);
      purged.push(row.id);
      bytes += row.sizeBytes;
    } catch (error) {
      console.error("[retention] could not remove a stored file", error);
    }
  }
  if (purged.length) {
    await db
      .update(document)
      .set({ filePurgedAt: new Date() })
      .where(and(inArray(document.id, purged), isNull(document.filePurgedAt)));
  }
  return { files: purged.length, bytes };
}
