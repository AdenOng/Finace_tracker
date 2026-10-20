import { TRPCError } from "@trpc/server";
import { and, asc, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import {
  category,
  categoryKind,
  merchantRule,
  transaction,
} from "~/server/db/schema";
import { presetDiff, reseedFromActivePack } from "~/server/db/seed/defaults";
import { activePresetPack } from "~/server/lib/preset";
import type { Database } from "~/server/db";
import { recordAudit } from "~/server/lib/audit";
import { outer } from "~/server/lib/sql";
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

const importRow = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z0-9][a-z0-9_.-]*$/, "Keys are lowercase slugs")
    .max(80),
  name: z.string().trim().min(1).max(80),
  kind: z.enum(categoryKind.enumValues).default("expense"),
  parentKey: z.string().trim().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  aiHint: z.string().trim().max(500).nullable().optional(),
  archived: z.boolean().optional(),
});
type Kind = (typeof categoryKind.enumValues)[number];

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
        transactionCount: sql<number>`(select count(*)::int from ${transaction} where ${transaction.categoryId} = ${outer(category.id)})`,
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
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "category.created",
        targetType: "category",
        targetId: row?.id,
        targetLabel: input.name,
      });
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
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "category.updated",
        targetType: "category",
        targetId: row.id,
        targetLabel: row.name,
      });
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
          .select({ id: category.id, name: category.name })
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
        let destination: { name: string; archivedAt: Date | null } | undefined;
        if (input.reassignToId) {
          [destination] = await tx
            .select({ name: category.name, archivedAt: category.archivedAt })
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
        await recordAudit(tx, {
          actorId: ctx.session.user.id,
          action: "category.archived",
          targetType: "category",
          targetId: target.id,
          targetLabel: target.name,
          details: {
            archived: ids.length,
            transactionsMoved: moved.length,
            movedTo: destination?.name ?? null,
          },
        });
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
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "category.restored",
        targetType: "category",
        targetId: input.id,
        details: { restored: restored.length },
      });
      return { restored: restored.length };
    }),

  /** Sets the order of siblings; `ids` must share a parent (or all be top level). */
  reorder: adminProcedure
    .input(z.object({ ids: z.array(z.uuid()).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const rows = await ctx.db
        .select({ id: category.id, parentId: category.parentId })
        .from(category)
        .where(inArray(category.id, input.ids));
      const parents = new Set(rows.map((r) => r.parentId));
      if (rows.length !== input.ids.length || parents.size > 1) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only categories under the same parent can be reordered",
        });
      }
      await ctx.db.transaction(async (tx) => {
        for (const [index, id] of input.ids.entries()) {
          await tx
            .update(category)
            .set({ sortOrder: (index + 1) * 10 })
            .where(eq(category.id, id));
        }
        await recordAudit(tx, {
          actorId: ctx.session.user.id,
          action: "category.reordered",
          targetType: "category",
          details: { categories: input.ids.length },
        });
      });
    }),

  /** What "Restore defaults" would bring back, so the button can say so before it is pressed. */
  defaultsPreview: adminProcedure.query(async ({ ctx }) => {
    const diff = await presetDiff(ctx.db, await activePresetPack());
    return diff.categories;
  }),

  /**
   * Creates or updates categories by key from an exported file. With `dryRun`, only reports what
   * would change. Archiving through import never moves transactions; use Archive for that.
   */
  importJson: adminProcedure
    .input(
      z.object({
        rows: z.array(importRow).min(1).max(500),
        dryRun: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const keys = new Set<string>();
      for (const row of input.rows) {
        if (keys.has(row.key))
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `"${row.key}" appears twice in the file`,
          });
        keys.add(row.key);
      }
      return ctx.db.transaction(async (tx) => {
        const fileRows = new Map(input.rows.map((r) => [r.key, r]));
        const referenced = [
          ...new Set(
            input.rows.flatMap((r) => (r.parentKey ? [r.parentKey] : [])),
          ),
        ];
        const existing = await tx
          .select()
          .from(category)
          .where(inArray(category.key, [...new Set([...keys, ...referenced])]));
        const byKey = new Map(existing.map((c) => [c.key, c]));
        const childCounts = new Map(
          (
            await tx
              .select({
                parentId: category.parentId,
                n: sql<number>`count(*)::int`,
              })
              .from(category)
              .where(
                inArray(
                  category.parentId,
                  existing.map((c) => c.id),
                ),
              )
              .groupBy(category.parentId)
          ).map((r) => [r.parentId, r.n]),
        );

        const errors: string[] = [];
        const kindOf = new Map<string, Kind>();
        // A subcategory cannot stay active under an archived parent: it would vanish from the
        // admin tree while the AI kept using it. Such rows are archived with their parent.
        const archivedByParent = new Set<string>();
        for (const row of input.rows) {
          if (!row.parentKey) continue;
          const fileParent = fileRows.get(row.parentKey);
          const dbParent = byKey.get(row.parentKey);
          if (!fileParent && !dbParent) {
            errors.push(
              `${row.name}: parent "${row.parentKey}" does not exist`,
            );
            continue;
          }
          const parentHasParent = fileParent
            ? !!fileParent.parentKey
            : !!dbParent?.parentId;
          const hasChildren =
            input.rows.some((r) => r.parentKey === row.key) ||
            (byKey.has(row.key) &&
              (childCounts.get(byKey.get(row.key)!.id) ?? 0) > 0);
          if (parentHasParent || hasChildren) {
            errors.push(
              `${row.name}: only two levels of categories are allowed`,
            );
            continue;
          }
          // Subcategories always share their parent's type.
          kindOf.set(row.key, (fileParent ?? dbParent)!.kind);
          const parentArchived = fileParent
            ? !!fileParent.archived
            : !!dbParent?.archivedAt;
          if (parentArchived && !row.archived) archivedByParent.add(row.key);
        }
        if (errors.length) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: errors.slice(0, 5).join(". "),
          });
        }

        let created = 0;
        let updated = 0;
        let unchanged = 0;
        const idByKey = new Map(existing.map((c) => [c.key, c.id]));
        // Parents first, so children can resolve their parent's id.
        const ordered = [
          ...input.rows.filter((r) => !r.parentKey),
          ...input.rows.filter((r) => r.parentKey),
        ];
        for (const row of ordered) {
          const current = byKey.get(row.key);
          const values = {
            name: row.name,
            kind: kindOf.get(row.key) ?? row.kind,
            parentId: row.parentKey
              ? (idByKey.get(row.parentKey) ?? null)
              : null,
            color: row.color ?? null,
            aiHint: row.aiHint ?? null,
            archivedAt:
              row.archived || archivedByParent.has(row.key)
                ? (current?.archivedAt ?? new Date())
                : null,
          };
          if (!current) {
            created++;
            if (input.dryRun) {
              // A placeholder so children of a new parent resolve during the dry run.
              idByKey.set(row.key, crypto.randomUUID());
            } else {
              const [inserted] = await tx
                .insert(category)
                .values({ ...values, key: row.key, sortOrder: 1000 + created })
                .returning({ id: category.id });
              idByKey.set(row.key, inserted!.id);
            }
            continue;
          }
          const same =
            current.name === values.name &&
            current.kind === values.kind &&
            current.parentId === values.parentId &&
            current.color === values.color &&
            current.aiHint === values.aiHint &&
            !!current.archivedAt === !!values.archivedAt;
          if (same) {
            unchanged++;
            continue;
          }
          updated++;
          if (!input.dryRun) {
            await tx
              .update(category)
              .set(values)
              .where(eq(category.id, current.id));
          }
        }
        // Existing subcategories missing from the file follow a parent the file archives.
        const archivedParentIds = input.rows
          .filter((r) => r.archived && !r.parentKey && byKey.has(r.key))
          .map((r) => byKey.get(r.key)!.id);
        const strayChildren = archivedParentIds.length
          ? (
              await tx
                .select({ id: category.id, key: category.key })
                .from(category)
                .where(
                  and(
                    inArray(category.parentId, archivedParentIds),
                    isNull(category.archivedAt),
                  ),
                )
            ).filter((c) => !fileRows.has(c.key))
          : [];
        if (strayChildren.length && !input.dryRun) {
          await tx
            .update(category)
            .set({ archivedAt: new Date() })
            .where(
              inArray(
                category.id,
                strayChildren.map((c) => c.id),
              ),
            );
        }
        const archivedWithParent = archivedByParent.size + strayChildren.length;
        if (!input.dryRun) {
          await recordAudit(tx, {
            actorId: ctx.session.user.id,
            action: "category.imported",
            targetType: "category",
            details: { created, updated, unchanged, archivedWithParent },
          });
        }
        return { created, updated, unchanged, archivedWithParent };
      });
    }),

  restoreDefaults: adminProcedure.mutation(async ({ ctx }) => {
    const report = await reseedFromActivePack(ctx.db);
    const restored = await ctx.db
      .update(category)
      .set({ archivedAt: null })
      .where(and(eq(category.isSystem, true), isNotNull(category.archivedAt)))
      .returning({ id: category.id });
    await recordAudit(ctx.db, {
      actorId: ctx.session.user.id,
      action: "category.defaults_restored",
      targetType: "category",
      details: { inserted: report.categories, unarchived: restored.length },
    });
    return { inserted: report.categories, unarchived: restored.length };
  }),
});
