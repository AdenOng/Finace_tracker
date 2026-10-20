import { desc } from "drizzle-orm";
import { NextResponse } from "next/server";

import {
  auditConditions,
  auditFilters,
  auditQuery,
} from "~/server/api/routers/admin/audit";
import { toCsv } from "~/lib/csv";
import { requireAdminRequest } from "~/server/auth/route-guard";
import { db } from "~/server/db";
import { auditLog } from "~/server/db/schema";

export const runtime = "nodejs";

const MAX_ROWS = 10_000;

/** The activity log as CSV, with the same filters as the page. */
export async function GET(request: Request) {
  const { denied } = await requireAdminRequest(request);
  if (denied) return denied;
  const params = Object.fromEntries(new URL(request.url).searchParams);
  const filters = auditFilters.safeParse(params);
  if (!filters.success)
    return NextResponse.json({ error: "Invalid filters" }, { status: 400 });

  const rows = await auditQuery(db)
    .where(auditConditions(filters.data))
    .orderBy(desc(auditLog.createdAt))
    .limit(MAX_ROWS);
  const lines = [
    ["When (UTC)", "Who", "Email", "Action", "Type", "Target", "Details"],
    ...rows.map((r) => [
      r.createdAt.toISOString(),
      r.actorName ?? "Deleted user",
      r.actorEmail,
      r.action,
      r.targetType,
      r.targetLabel,
      r.details,
    ]),
  ];
  const body = toCsv(lines);
  const stamp = new Date().toISOString().slice(0, 10);
  return new Response(body, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="finfolio-activity-${stamp}.csv"`,
      "cache-control": "no-store",
    },
  });
}
