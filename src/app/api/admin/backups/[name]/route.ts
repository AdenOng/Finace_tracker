import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";

import { NextResponse } from "next/server";

import { requireAdminRequest } from "~/server/auth/route-guard";
import { db } from "~/server/db";
import { recordAudit } from "~/server/lib/audit";
import { backupPath } from "~/server/modules/backups";

export const runtime = "nodejs";

/**
 * Downloads one database dump. It holds every user's data, so it is admin-only, never cached,
 * and every download is written to the activity log.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ name: string }> },
) {
  const { session, denied } = await requireAdminRequest(request);
  if (denied) return denied;
  const { name } = await params;
  const file = backupPath(name);
  if (!file) return NextResponse.json({ error: "Not found" }, { status: 404 });
  let size: number;
  try {
    size = (await stat(file)).size;
  } catch {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  await recordAudit(db, {
    actorId: session.user.id,
    action: "backup.downloaded",
    targetType: "backup",
    targetLabel: name,
  });
  return new Response(
    Readable.toWeb(createReadStream(file)) as unknown as ReadableStream,
    {
      headers: {
        "content-type": "application/octet-stream",
        "content-length": String(size),
        "content-disposition": `attachment; filename="${name}"`,
        "cache-control": "no-store",
      },
    },
  );
}
