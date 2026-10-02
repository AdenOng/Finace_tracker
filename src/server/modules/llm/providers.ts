import { and, eq, isNull } from "drizzle-orm";

import type { Database } from "~/server/db";
import { llmProvider } from "~/server/db/schema";

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
