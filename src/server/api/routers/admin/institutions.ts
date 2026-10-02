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
import { reseedFromActivePack } from "~/server/db/seed/defaults";

const institutionInput = z.object({
  name: z.string().trim().min(1).max(120),
  kind: z.enum(institutionKind.enumValues),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .length(2)
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
        accountCount: sql<number>`(select count(*)::int from ${financialAccount} where ${financialAccount.institutionId} = ${institution.id})`,
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
        if (row) return row;
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
        .select({ isSystem: institution.isSystem })
        .from(institution)
        .where(eq(institution.id, input.id));
      if (!target) throw new TRPCError({ code: "NOT_FOUND" });
      const inUse =
        (await ctx.db.$count(
          financialAccount,
          eq(financialAccount.institutionId, input.id),
        )) +
        (await ctx.db.$count(document, eq(document.institutionId, input.id)));
      if (target.isSystem || inUse > 0) {
        await ctx.db
          .update(institution)
          .set({ archivedAt: new Date() })
          .where(eq(institution.id, input.id));
        return {
          outcome: "archived" as const,
          reason: target.isSystem ? ("default" as const) : ("in_use" as const),
        };
      }
      await ctx.db.delete(institution).where(eq(institution.id, input.id));
      return { outcome: "deleted" as const };
    }),

  restore: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db
        .update(institution)
        .set({ archivedAt: null })
        .where(eq(institution.id, input.id));
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
    return { inserted: report.institutions, unarchived: restored.length };
  }),
});
