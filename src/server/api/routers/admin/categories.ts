import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import {
  category,
  categoryKind,
  merchantRule,
  transaction,
} from "~/server/db/schema";
import { reseedFromActivePack } from "~/server/db/seed/defaults";
import type { Database } from "~/server/db";
import {
  CategoryTreeError,
  validateCategoryParent,
} from "~/server/modules/catalog/category-tree";

const categoryInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(categoryKind.enumValues),
  parentId: z.uuid().nullable(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable(),
  aiHint: z
    .string()
    .trim()
    .max(500)
    .nullable()
    .or(z.literal("").transform(() => null)),
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40);
}

async function checkParent(
  db: Database,
  parentId: string | null,
  categoryId?: string,
) {
  const [parent] = parentId
    ? await db.select().from(category).where(eq(category.id, parentId)).limit(1)
    : [];
  const hasChildren = !!(
    parentId &&
    categoryId &&
    (await db.$count(category, eq(category.parentId, categoryId)))
  );
  try {
    validateCategoryParent({
      parentId,
      parent: parent ?? null,
      categoryId,
      hasChildren,
    });
  } catch (error) {
    if (!(error instanceof CategoryTreeError)) throw error;
    throw new TRPCError({ code: "BAD_REQUEST", message: error.message });
  }
  return parent;
}

export const adminCategoriesRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: category.id,
        key: category.key,
        name: category.name,
        kind: category.kind,
        parentId: category.parentId,
        color: category.color,
        aiHint: category.aiHint,
        isSystem: category.isSystem,
        archivedAt: category.archivedAt,
        sortOrder: category.sortOrder,
        transactionCount: sql<number>`(select count(*)::int from ${transaction} where ${transaction.categoryId} = ${category.id})`,
      })
      .from(category)
      .orderBy(asc(category.sortOrder), asc(category.name)),
  ),

  create: adminProcedure
    .input(categoryInput)
    .mutation(async ({ ctx, input }) => {
      const parent = await checkParent(ctx.db, input.parentId);
      const prefix = parent ? `${parent.key}.` : "";
      const base = `${prefix}${slugify(input.name) || "category"}`;
      const existing = await ctx.db.$count(category, eq(category.key, base));
      const key = existing > 0 ? `${base}_${Date.now().toString(36)}` : base;
      const [row] = await ctx.db
        .insert(category)
        .values({ ...input, key, sortOrder: 1000 })
        .returning();
      return row;
    }),

  update: adminProcedure
    .input(categoryInput.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...values } = input;
      await checkParent(ctx.db, values.parentId, id);
      const [row] = await ctx.db
        .update(category)
        .set(values)
        .where(eq(category.id, id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  /**
   * Archives a category (and its children). Existing transactions and merchant rules are moved to
   * `reassignToId` so nothing is left pointing at a hidden category.
   */
  archive: adminProcedure
    .input(z.object({ id: z.uuid(), reassignToId: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.transaction(async (tx) => {
        const [target] = await tx
          .select({ id: category.id })
          .from(category)
          .where(eq(category.id, input.id));
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        const children = await tx
          .select({ id: category.id })
          .from(category)
          .where(eq(category.parentId, input.id));
        const ids = [input.id, ...children.map((c) => c.id)];
        if (input.reassignToId && ids.includes(input.reassignToId)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Pick a category outside the one being removed",
          });
        }
        if (input.reassignToId) {
          const [destination] = await tx
            .select({ archivedAt: category.archivedAt })
            .from(category)
            .where(eq(category.id, input.reassignToId));
          if (!destination || destination.archivedAt) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "Pick an active destination category",
            });
          }
        }
        const moved = await tx
          .update(transaction)
          .set({ categoryId: input.reassignToId, categorySource: "user" })
          .where(inArray(transaction.categoryId, ids))
          .returning({ id: transaction.id });
        if (input.reassignToId) {
          await tx
            .update(merchantRule)
            .set({ categoryId: input.reassignToId })
            .where(inArray(merchantRule.categoryId, ids));
        } else {
          await tx
            .delete(merchantRule)
            .where(inArray(merchantRule.categoryId, ids));
        }
        await tx
          .update(category)
          .set({ archivedAt: new Date() })
          .where(inArray(category.id, ids));
        return { archived: ids.length, transactionsMoved: moved.length };
      });
    }),

  /** Restores a category. A subcategory brings its archived parent back too, or it would be orphaned. */
  restore: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select({ parentId: category.parentId })
        .from(category)
        .where(eq(category.id, input.id));
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      const ids = target.parentId ? [input.id, target.parentId] : [input.id];
      const restored = await ctx.db
        .update(category)
        .set({ archivedAt: null })
        .where(and(inArray(category.id, ids), isNotNull(category.archivedAt)))
        .returning({ id: category.id });
      return { restored: restored.length };
    }),

  restoreDefaults: adminProcedure.mutation(async ({ ctx }) => {
    const report = await reseedFromActivePack(ctx.db);
    const restored = await ctx.db
      .update(category)
      .set({ archivedAt: null })
      .where(and(eq(category.isSystem, true), isNotNull(category.archivedAt)))
      .returning({ id: category.id });
    return { inserted: report.categories, unarchived: restored.length };
  }),
});
