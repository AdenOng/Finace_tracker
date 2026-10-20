import "server-only";

import { eq } from "drizzle-orm";

import { db } from "~/server/db";
import { session as sessionTable } from "~/server/db/schema";
import { cachedInstanceSettings } from "~/server/lib/instance-settings-cache";
import { auth } from "./config";

const DAY_MS = 86_400_000;

/**
 * The signed-in session for these headers, after the admin's maximum session length. Better Auth
 * already expires idle sessions; this also ends active ones a fixed time after sign-in.
 */
export async function getSessionFor(headers: Headers) {
  const current = await auth.api.getSession({ headers });
  if (!current) return null;
  const days = cachedInstanceSettings().maxSessionDays;
  if (
    days &&
    Date.now() - new Date(current.session.createdAt).getTime() > days * DAY_MS
  ) {
    await db
      .delete(sessionTable)
      .where(eq(sessionTable.id, current.session.id));
    return null;
  }
  return current;
}
