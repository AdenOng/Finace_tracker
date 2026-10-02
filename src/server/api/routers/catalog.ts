import { asc, eq, isNull } from "drizzle-orm";

import {
  createTRPCRouter,
  enrollingProcedure,
  protectedProcedure,
} from "~/server/api/trpc";
import { category, currency, institution } from "~/server/db/schema";

/** Read-only view of admin-managed reference data, for every signed-in user. */
export const catalogRouter = createTRPCRouter({
  // Settings page (display currency) loads this while the user may still be enrolling.
  currencies: enrollingProcedure.query(({ ctx }) =>
    ctx.db
      .select()
      .from(currency)
      .where(eq(currency.isActive, true))
      .orderBy(asc(currency.sortOrder)),
  ),

  institutions: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: institution.id,
        key: institution.key,
        name: institution.name,
        kind: institution.kind,
        country: institution.country,
        ingestMethods: institution.ingestMethods,
      })
      .from(institution)
      .where(isNull(institution.archivedAt))
      .orderBy(asc(institution.kind), asc(institution.sortOrder)),
  ),

  categories: protectedProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: category.id,
        key: category.key,
        name: category.name,
        kind: category.kind,
        parentId: category.parentId,
        color: category.color,
      })
      .from(category)
      .where(isNull(category.archivedAt))
      .orderBy(asc(category.sortOrder)),
  ),
});
