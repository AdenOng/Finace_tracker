import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "~/server/db";
import { llmProvider } from "~/server/db/schema";

/** The default local service follows its deployment address; explicit custom URLs stay intact. */
export function opencodeBaseUrl(stored: string | null, deployment: string) {
  return !stored || /^http:\/\/(localhost|127\.0\.0\.1):4096\/?$/i.test(stored)
    ? deployment : stored;
}

/** Admin operations manage platform providers, never another user's private credentials. */
export function sharedProviderFilter(id: string) {
  return and(eq(llmProvider.id, id), isNull(llmProvider.ownerId));
}

export async function findSharedProvider(
  db: Pick<Database, "select">,
  id: string,
) {
  const [row] = await db
    .select()
    .from(llmProvider)
    .where(sharedProviderFilter(id))
    .limit(1);
  return row ?? null;
}
