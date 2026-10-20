import { TRPCError } from "@trpc/server";
import { and, asc, eq, gte, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import type { Database } from "~/server/db";
import { llmProvider, llmProviderKind, llmUsage } from "~/server/db/schema";
import { createLlmAdapter, toProviderConfig } from "~/server/modules/llm";
import { describeLlmError } from "~/server/modules/llm/errors";
import {
  findSharedProvider,
  sharedProviderFilter,
} from "~/server/modules/llm/providers";
import {
  checkProvider,
  monthlyTokenUsage,
  monthStart,
} from "~/server/modules/llm/routing";
import { recordAudit } from "~/server/lib/audit";
import {
  cachedInstanceSettings,
  updateInstanceSettings,
} from "~/server/lib/instance-settings";
import { decryptSecret, encryptSecret, maskSecret } from "~/server/lib/secrets";

const DAY_MS = 86_400_000;

const price = z
  .string()
  .trim()
  .regex(/^\d{1,8}(\.\d{1,4})?$/, "Use a price like 0.15")
  .nullable()
  .or(z.literal("").transform(() => null));

const providerInput = z.object({
  name: z.string().trim().min(1).max(80),
  kind: z.enum(llmProviderKind.enumValues),
  baseUrl: z
    .url()
    .nullable()
    .or(z.literal("").transform(() => null)),
  /** undefined = keep current key, null/"" = clear it. */
  apiKey: z.string().trim().nullable().optional(),
  defaultModel: z.string().trim().min(1),
  supportsVision: z.boolean(),
  isEnabled: z.boolean(),
  inputCostPerMTok: price.optional(),
  outputCostPerMTok: price.optional(),
  monthlyTokenLimit: z.number().int().positive().nullable().optional(),
  pauseAtLimit: z.boolean().optional(),
});

async function loadProvider(db: Database, id: string) {
  const row = await findSharedProvider(db, id);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

export const adminAiRouter = createTRPCRouter({
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(llmProvider)
      .where(isNull(llmProvider.ownerId))
      .orderBy(asc(llmProvider.createdAt));
    const usage = await monthlyTokenUsage(
      ctx.db,
      rows.map((r) => r.id),
    );
    const fallbackId = cachedInstanceSettings().fallbackProviderId;
    return rows.map(({ apiKeyEncrypted, ...row }) => {
      let apiKeyPreview: string | null = null;
      if (apiKeyEncrypted) {
        try {
          apiKeyPreview = maskSecret(decryptSecret(apiKeyEncrypted));
        } catch {
          apiKeyPreview = "unreadable — re-enter key";
        }
      }
      const tokensThisMonth = usage.get(row.id) ?? 0;
      return {
        ...row,
        apiKeyPreview,
        isFallback: row.id === fallbackId,
        tokensThisMonth,
        limitReached:
          row.monthlyTokenLimit !== null &&
          tokensThisMonth >= row.monthlyTokenLimit,
      };
    });
  }),

  create: adminProcedure
    .input(providerInput)
    .mutation(async ({ ctx, input }) => {
      const { apiKey, ...values } = input;
      const isFirst =
        (await ctx.db.$count(llmProvider, isNull(llmProvider.ownerId))) === 0;
      const [row] = await ctx.db
        .insert(llmProvider)
        .values({
          ...values,
          apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : null,
          isDefault: isFirst,
        })
        .returning({ id: llmProvider.id });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "provider.created",
        targetType: "provider",
        targetId: row?.id,
        targetLabel: input.name,
        details: { kind: input.kind, model: input.defaultModel },
      });
      return row;
    }),

  update: adminProcedure
    .input(providerInput.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, apiKey, ...values } = input;
      const current = await loadProvider(ctx.db, id);
      if (current.isDefault && !values.isEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "This is the default provider. Make another provider the default before disabling it.",
        });
      }
      const [row] = await ctx.db
        .update(llmProvider)
        .set({
          ...values,
          ...(apiKey === undefined
            ? {}
            : { apiKeyEncrypted: apiKey ? encryptSecret(apiKey) : null }),
        })
        .where(sharedProviderFilter(id))
        .returning({ id: llmProvider.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "provider.updated",
        targetType: "provider",
        targetId: id,
        targetLabel: values.name,
        details: {
          model: values.defaultModel,
          enabled: values.isEnabled,
          apiKey:
            apiKey === undefined
              ? "unchanged"
              : apiKey
                ? "replaced"
                : "cleared",
        },
      });
    }),

  remove: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(({ ctx, input }) =>
      ctx.db.transaction(async (tx) => {
        const [row] = await tx
          .delete(llmProvider)
          .where(sharedProviderFilter(input.id))
          .returning({
            id: llmProvider.id,
            name: llmProvider.name,
            isDefault: llmProvider.isDefault,
          });
        if (!row) throw new TRPCError({ code: "NOT_FOUND" });
        // Imports need a default; hand it to the oldest enabled provider that is left.
        let promoted: { id: string; name: string } | null = null;
        if (row.isDefault) {
          const [next] = await tx
            .select({ id: llmProvider.id, name: llmProvider.name })
            .from(llmProvider)
            .where(
              and(isNull(llmProvider.ownerId), eq(llmProvider.isEnabled, true)),
            )
            .orderBy(asc(llmProvider.createdAt))
            .limit(1);
          if (next) {
            await tx
              .update(llmProvider)
              .set({ isDefault: true })
              .where(sharedProviderFilter(next.id));
            promoted = next;
          }
        }
        if (cachedInstanceSettings().fallbackProviderId === row.id) {
          await updateInstanceSettings(tx, { fallbackProviderId: null });
        }
        await recordAudit(tx, {
          actorId: ctx.session.user.id,
          action: "provider.removed",
          targetType: "provider",
          targetId: row.id,
          targetLabel: row.name,
          details: promoted ? { newDefault: promoted.name } : undefined,
        });
        return { promoted };
      }),
    ),

  /** The provider imports fall back to when the default fails or is over its limit. */
  setFallback: adminProcedure
    .input(z.object({ id: z.uuid().nullable() }))
    .mutation(async ({ ctx, input }) => {
      const target = input.id ? await loadProvider(ctx.db, input.id) : null;
      if (target?.isDefault) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "The default provider cannot also be its own fallback",
        });
      }
      if (target && !target.isEnabled) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Enable this provider before making it the fallback",
        });
      }
      await updateInstanceSettings(ctx.db, { fallbackProviderId: input.id });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: target ? "provider.set_fallback" : "provider.fallback_cleared",
        targetType: "provider",
        targetId: target?.id,
        targetLabel: target?.name ?? null,
      });
    }),

  healthChecks: adminProcedure.query(
    () => cachedInstanceSettings().providerHealthChecks,
  ),

  setHealthChecks: adminProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      await updateInstanceSettings(ctx.db, {
        providerHealthChecks: input.enabled,
      });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "settings.health_checks_updated",
        targetType: "settings",
        targetLabel: "Scheduled provider checks",
        details: { enabled: input.enabled },
      });
    }),

  /** Daily tokens per provider and model, plus this month's totals and estimated cost. */
  usage: adminProcedure
    .input(z.object({ days: z.number().int().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date(Date.now() - (input.days - 1) * DAY_MS);
      since.setUTCHours(0, 0, 0, 0);
      const daily = await ctx.db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${llmUsage.createdAt} at time zone 'UTC'), 'YYYY-MM-DD')`,
          providerId: llmUsage.providerId,
          model: llmUsage.model,
          jobs: sql<number>`count(*)::int`,
          inputTokens:
            sql<number>`coalesce(sum(${llmUsage.inputTokens}), 0)::bigint`.mapWith(
              Number,
            ),
          outputTokens:
            sql<number>`coalesce(sum(${llmUsage.outputTokens}), 0)::bigint`.mapWith(
              Number,
            ),
        })
        .from(llmUsage)
        .where(gte(llmUsage.createdAt, since))
        .groupBy(sql`1`, llmUsage.providerId, llmUsage.model)
        .orderBy(sql`1`);
      const month = await ctx.db
        .select({
          providerId: llmUsage.providerId,
          model: llmUsage.model,
          jobs: sql<number>`count(*)::int`,
          inputTokens:
            sql<number>`coalesce(sum(${llmUsage.inputTokens}), 0)::bigint`.mapWith(
              Number,
            ),
          outputTokens:
            sql<number>`coalesce(sum(${llmUsage.outputTokens}), 0)::bigint`.mapWith(
              Number,
            ),
        })
        .from(llmUsage)
        .where(gte(llmUsage.createdAt, monthStart()))
        .groupBy(llmUsage.providerId, llmUsage.model);
      const providers = await ctx.db
        .select({
          id: llmProvider.id,
          name: llmProvider.name,
          inputCostPerMTok: llmProvider.inputCostPerMTok,
          outputCostPerMTok: llmProvider.outputCostPerMTok,
          monthlyTokenLimit: llmProvider.monthlyTokenLimit,
          pauseAtLimit: llmProvider.pauseAtLimit,
        })
        .from(llmProvider)
        .where(isNull(llmProvider.ownerId));
      return { since, days: input.days, daily, month, providers };
    }),

  setDefault: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        const target = await findSharedProvider(tx, input.id);
        if (!target) throw new TRPCError({ code: "NOT_FOUND" });
        await tx
          .update(llmProvider)
          .set({ isDefault: false })
          .where(isNull(llmProvider.ownerId));
        await tx
          .update(llmProvider)
          .set({ isDefault: true, isEnabled: true })
          .where(sharedProviderFilter(input.id));
        await recordAudit(tx, {
          actorId: ctx.session.user.id,
          action: "provider.set_default",
          targetType: "provider",
          targetId: target.id,
          targetLabel: target.name,
        });
      });
    }),

  /**
   * Lists models for a provider as configured in the form, saved or not. A blank key on a saved
   * provider uses the stored one.
   */
  models: adminProcedure
    .input(
      z.object({
        id: z.uuid().optional(),
        kind: z.enum(llmProviderKind.enumValues),
        baseUrl: providerInput.shape.baseUrl,
        apiKey: z.string().trim().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const saved = input.id ? await loadProvider(ctx.db, input.id) : null;
      const config = toProviderConfig({
        ...(saved ?? { apiKeyEncrypted: null, defaultModel: "" }),
        kind: input.kind,
        baseUrl: input.baseUrl,
      } as typeof llmProvider.$inferSelect);
      if (input.apiKey) config.apiKey = input.apiKey;
      try {
        const models = await createLlmAdapter(config).listModels();
        return { ok: true as const, models };
      } catch (error) {
        return {
          ok: false as const,
          error: describeLlmError(error),
          models: [],
        };
      }
    }),

  /** Round-trips a tiny structured request; the result is kept as the provider's health. */
  test: adminProcedure
    .input(z.object({ id: z.uuid(), model: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadProvider(ctx.db, input.id);
      return checkProvider(ctx.db, row, input.model);
    }),
});
