import { and, desc, eq, lt } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { auditLog, user } from "~/server/db/schema";

const PAGE_SIZE = 50;

export const adminAuditRouter = createTRPCRouter({
  list: adminProcedure
    .input(
      z.object({
        targetType: z
          .enum(["user", "invitation", "provider", "category", "institution"])
          .optional(),
        /** createdAt of the last entry on the previous page. */
        cursor: z.date().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const rows = await ctx.db
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
        .leftJoin(user, eq(user.id, auditLog.actorId))
        .where(
          and(
            input.targetType
              ? eq(auditLog.targetType, input.targetType)
              : undefined,
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
});
