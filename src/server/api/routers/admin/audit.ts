import { and, asc, desc, eq, gte, ilike, isNotNull, lt, or } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import type { Database } from "~/server/db";
import { auditLog, user } from "~/server/db/schema";

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

export const auditTargetTypes = [
  "user",
  "invitation",
  "provider",
  "category",
  "institution",
  "workspace",
  "settings",
  "job",
  "backup",
  "preset",
] as const;

export const auditFilters = z.object({
  targetType: z.enum(auditTargetTypes).optional(),
  actorId: z.string().optional(),
  /** Inclusive calendar days, YYYY-MM-DD, in UTC. */
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  query: z.string().trim().max(100).optional(),
});

export function auditConditions(input: z.infer<typeof auditFilters>) {
  const pattern = input.query ? `%${input.query}%` : null;
  return and(
    input.targetType ? eq(auditLog.targetType, input.targetType) : undefined,
    input.actorId ? eq(auditLog.actorId, input.actorId) : undefined,
    input.from ? gte(auditLog.createdAt, new Date(input.from)) : undefined,
    input.to
      ? lt(auditLog.createdAt, new Date(new Date(input.to).getTime() + DAY_MS))
      : undefined,
    pattern
      ? or(
          ilike(auditLog.targetLabel, pattern),
          ilike(auditLog.action, pattern),
          ilike(user.name, pattern),
        )
      : undefined,
  );
}

export function auditQuery(db: Database) {
  return db
    .select({
      id: auditLog.id,
      createdAt: auditLog.createdAt,
      action: auditLog.action,
      targetType: auditLog.targetType,
      targetLabel: auditLog.targetLabel,
      details: auditLog.details,
      actorName: user.name,
      actorEmail: user.email,
    })
    .from(auditLog)
    .leftJoin(user, eq(user.id, auditLog.actorId));
}

export const adminAuditRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      auditFilters.extend({
        /** createdAt of the last entry on the previous page. */
        cursor: z.date().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await auditQuery(ctx.db)
        .where(
          and(
            auditConditions(input),
            input.cursor ? lt(auditLog.createdAt, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(auditLog.createdAt))
        .limit(PAGE_SIZE + 1);
      const hasMore = rows.length > PAGE_SIZE;
      const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      return {
        items,
        nextCursor: hasMore ? (items.at(-1)?.createdAt ?? null) : null,
      };
    }),

  /** People who appear in the log, for the "who" filter. */
  actors: adminProcedure.query(({ ctx }) =>
    ctx.db
      .selectDistinct({ id: user.id, name: user.name, email: user.email })
      .from(auditLog)
      .innerJoin(user, eq(user.id, auditLog.actorId))
      .where(isNotNull(auditLog.actorId))
      .orderBy(asc(user.name)),
  ),
});
