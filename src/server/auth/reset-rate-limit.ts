import "server-only";

import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { getIP } from "better-auth/api";
import { lt, or, sql } from "drizzle-orm";

import type { Database } from "~/server/db";
import { authRateLimit } from "~/server/db/schema";

/** Shared across processes and restarts. The reverse proxy must overwrite X-Forwarded-For. */
export async function limitPasswordReset(
  db: Pick<Database, "insert" | "delete">,
  headers: Headers,
  operation: "request" | "complete",
) {
  // If no trustworthy address is available, share a bucket instead of skipping the limit.
  const address = getIP(headers, {}) ?? "unknown";
  const key = createHash("sha256")
    .update(`${operation}:${address}`)
    .digest("hex");
  const now = new Date();
  const cutoff = new Date(now.getTime() - 60_000);
  const max = operation === "request" ? 5 : 10;

  await db
    .delete(authRateLimit)
    .where(
      lt(authRateLimit.windowStartedAt, new Date(now.getTime() - 86_400_000)),
    );
  const rows = await db
    .insert(authRateLimit)
    .values({ key, count: 1, windowStartedAt: now })
    .onConflictDoUpdate({
      target: authRateLimit.key,
      set: {
        count: sql`case when ${authRateLimit.windowStartedAt} < ${cutoff} then 1 else ${authRateLimit.count} + 1 end`,
        windowStartedAt: sql`case when ${authRateLimit.windowStartedAt} < ${cutoff} then ${now} else ${authRateLimit.windowStartedAt} end`,
      },
      setWhere: or(
        lt(authRateLimit.windowStartedAt, cutoff),
        lt(authRateLimit.count, max),
      ),
    })
    .returning({ key: authRateLimit.key });
  if (!rows.length) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: "Too many password reset attempts. Try again in a minute.",
    });
  }
}
