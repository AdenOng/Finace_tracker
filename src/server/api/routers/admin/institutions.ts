import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import {
  document,
  financialAccount,
  institution,
  institutionKind,
  ingestMethod,
} from "~/server/db/schema";
import { presetDiff, reseedFromActivePack } from "~/server/db/seed/defaults";
import { activePresetPack } from "~/server/lib/preset";
import { recordAudit } from "~/server/lib/audit";
import { outer } from "~/server/lib/sql";

const institutionInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(institutionKind.enumValues),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "Use a two-letter country code, e.g. SG")
    .nullable()
    .or(z.literal("").transform(() => null)),
  website: z
    .url()
    .nullable()
    .or(z.literal("").transform(() => null)),
  ingestMethods: z.array(z.enum(ingestMethod.enumValues)).min(1),
  apiAdapter: z
    .string()
    .trim()
    .nullable()
    .or(z.literal("").transform(() => null)),
  extractionHints: z
    .string()
    .trim()
    .max(2000)
    .nullable()
    .or(z.literal("").transform(() => null)),
});

function slugify(name: string) {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 48);
}

export const adminInstitutionsRouter = createTRPCRouter({
  list: adminProcedure.query(({ ctx }) =>
    ctx.db
      .select({
        id: institution.id,
        key: institution.key,
        name: institution.name,
        kind: institution.kind,
        country: institution.country,
        website: institution.website,
        ingestMethods: institution.ingestMethods,
        apiAdapter: institution.apiAdapter,
        extractionHints: institution.extractionHints,
        isSystem: institution.isSystem,
        archivedAt: institution.archivedAt,
        accountCount: sql<number>`(select count(*)::int from ${financialAccount} where ${financialAccount.institutionId} = ${outer(institution.id)})`,
        documentCount: sql<number>`(select count(*)::int from ${document} where ${document.institutionId} = ${outer(institution.id)})`,
      })
      .from(institution)
      .orderBy(
        asc(institution.kind),
        asc(institution.sortOrder),
        asc(institution.name),
      ),
  ),

  create: adminProcedure
    .input(institutionInput)
    .mutation(async ({ ctx, input }) => {
      const base = slugify(input.name) || "institution";
      // Pick the first free `base`, `base_2`, `base_3`… and retry if a concurrent create takes it.
      for (let attempt = 0; attempt < 5; attempt++) {
        const taken = new Set(
          (
            await ctx.db
              .select({ key: institution.key })
              .from(institution)
              .where(
                sql`${institution.key} = ${base} or starts_with(${institution.key}, ${base + "_"})`,
              )
          ).map((r) => r.key),
        );
        let key = base;
        for (let n = 2; taken.has(key); n++) key = `${base}_${n}`;
        const [row] = await ctx.db
          .insert(institution)
          .values({ ...input, key, sortOrder: 1000 })
          .onConflictDoNothing({ target: institution.key })
          .returning();
        if (row) {
          await recordAudit(ctx.db, {
            actorId: ctx.session.user.id,
            action: "institution.created",
            targetType: "institution",
            targetId: row.id,
            targetLabel: row.name,
          });
          return row;
        }
      }
      throw new TRPCError({
        code: "CONFLICT",
        message: "Could not allocate a key; try again",
      });
    }),

  update: adminProcedure
    .input(institutionInput.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, ...values } = input;
      const [row] = await ctx.db
        .update(institution)
        .set(values)
        .where(eq(institution.id, id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "institution.updated",
        targetType: "institution",
        targetId: row.id,
        targetLabel: row.name,
      });
      return row;
    }),

  /**
   * Removes an institution. Defaults from the preset pack, and anything an account or document
   * still references, are archived instead (hidden from users, history kept) — deleting a default
   * would let the next boot's seed re-insert it. Other institutions are deleted outright.
   */
  remove: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [target] = await ctx.db
        .select({ isSystem: institution.isSystem, name: institution.name })
        .from(institution)
        .where(eq(institution.id, input.id));
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      const inUse =
        (await ctx.db.$count(
          financialAccount,
          eq(financialAccount.institutionId, input.id),
        )) +
        (await ctx.db.$count(document, eq(document.institutionId, input.id)));
      const audit = (outcome: string) =>
        recordAudit(ctx.db, {
          actorId: ctx.session.user.id,
          action: `institution.${outcome}`,
          targetType: "institution",
          targetId: input.id,
          targetLabel: target.name,
        });
      if (target.isSystem || inUse > 0) {
        await ctx.db
          .update(institution)
          .set({ archivedAt: new Date() })
          .where(eq(institution.id, input.id));
        await audit("archived");
        return {
          outcome: "archived" as const,
          reason: target.isSystem ? ("default" as const) : ("in_use" as const),
        };
      }
      await ctx.db.delete(institution).where(eq(institution.id, input.id));
      await audit("deleted");
      return { outcome: "deleted" as const };
    }),

  restore: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .update(institution)
        .set({ archivedAt: null })
        .where(eq(institution.id, input.id))
        .returning({ id: institution.id, name: institution.name });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "institution.restored",
        targetType: "institution",
        targetId: row.id,
        targetLabel: row.name,
      });
    }),

  /**
   * Folds a duplicate into another institution: accounts and uploads move to `targetId`, then the
   * duplicate is deleted (or archived if it is a default, so the next seed does not re-add it).
   */
  merge: adminProcedure
    .input(z.object({ sourceId: z.uuid(), targetId: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      if (input.sourceId === input.targetId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Pick a different institution to merge into",
        });
      }
      return ctx.db.transaction(async (tx) => {
        const rows = await tx
          .select({
            id: institution.id,
            name: institution.name,
            isSystem: institution.isSystem,
            archivedAt: institution.archivedAt,
          })
          .from(institution)
          .where(
            sql`${institution.id} in (${input.sourceId}, ${input.targetId})`,
          );
        const source = rows.find((r) => r.id === input.sourceId);
        const target = rows.find((r) => r.id === input.targetId);
        if (!source || !target) throw new TRPCError({ code: "NOT_FOUND" });
        if (target.archivedAt) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Restore the institution you are merging into first",
          });
        }
        const accounts = await tx
          .update(financialAccount)
          .set({ institutionId: target.id })
          .where(eq(financialAccount.institutionId, source.id))
          .returning({ id: financialAccount.id });
        const documents = await tx
          .update(document)
          .set({ institutionId: target.id })
          .where(eq(document.institutionId, source.id))
          .returning({ id: document.id });
        if (source.isSystem) {
          await tx
            .update(institution)
            .set({ archivedAt: new Date() })
            .where(eq(institution.id, source.id));
        } else {
          await tx.delete(institution).where(eq(institution.id, source.id));
        }
        await recordAudit(tx, {
          actorId: ctx.session.user.id,
          action: "institution.merged",
          targetType: "institution",
          targetId: target.id,
          targetLabel: target.name,
          details: {
            from: source.name,
            accountsMoved: accounts.length,
            uploadsMoved: documents.length,
          },
        });
        return {
          accountsMoved: accounts.length,
          sourceArchived: source.isSystem,
        };
      });
    }),

  defaultsPreview: adminProcedure.query(async ({ ctx }) => {
    const diff = await presetDiff(ctx.db, await activePresetPack());
    return diff.institutions;
  }),

  /** Brings back every default from the preset pack: re-inserts missing ones, un-archives archived ones. */
  restoreDefaults: adminProcedure.mutation(async ({ ctx }) => {
    const report = await reseedFromActivePack(ctx.db);
    const restored = await ctx.db
      .update(institution)
      .set({ archivedAt: null })
      .where(
        and(eq(institution.isSystem, true), isNotNull(institution.archivedAt)),
      )
      .returning({ id: institution.id });
    await recordAudit(ctx.db, {
      actorId: ctx.session.user.id,
      action: "institution.defaults_restored",
      targetType: "institution",
      details: { inserted: report.institutions, unarchived: restored.length },
    });
    return { inserted: report.institutions, unarchived: restored.length };
  }),
});
