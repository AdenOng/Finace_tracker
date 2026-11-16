import { sql } from "drizzle-orm";
import { db } from "~/server/db";

export const dynamic = "force-dynamic";

/** Public connection probe; provider details require an authenticated session. */
export async function GET() {
  try {
    await db.execute(sql`select 1`);
    return Response.json(
      { service: "finfolio", status: "ok" },
      {
        headers: { "cache-control": "no-store" },
      },
    );
  } catch {
    return Response.json(
      { service: "finfolio", status: "unavailable" },
      {
        status: 503,
        headers: { "cache-control": "no-store" },
      },
    );
  }
}
