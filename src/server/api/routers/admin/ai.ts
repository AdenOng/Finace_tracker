import { TRPCError } from "@trpc/server";
import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import type { Database } from "~/server/db";
import { llmProvider, llmProviderKind } from "~/server/db/schema";
import { createLlmAdapter, toProviderConfig } from "~/server/modules/llm";
import { describeLlmError } from "~/server/modules/llm/errors";
import {
  findSharedProvider,
  sharedProviderFilter,
} from "~/server/modules/llm/providers";
import { recordAudit } from "~/server/lib/audit";
import { decryptSecret, encryptSecret, maskSecret } from "~/server/lib/secrets";

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
    return rows.map(({ apiKeyEncrypted, ...row }) => {
      let apiKeyPreview: string | null = null;
      if (apiKeyEncrypted) {
        try {
          apiKeyPreview = maskSecret(decryptSecret(apiKeyEncrypted));
        } catch {
          apiKeyPreview = "unreadable — re-enter key";
        }
      }
      return { ...row, apiKeyPreview };
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

  models: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .query(async ({ ctx, input }) => {
      const row = await loadProvider(ctx.db, input.id);
      try {
        const models = await createLlmAdapter(
          toProviderConfig(row),
        ).listModels();
        return { ok: true as const, models };
      } catch (error) {
        return {
          ok: false as const,
          error: describeLlmError(error),
          models: [],
        };
      }
    }),

  /** Round-trips a tiny structured request to prove the key, model and JSON mode all work. */
  test: adminProcedure
    .input(z.object({ id: z.uuid(), model: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const row = await loadProvider(ctx.db, input.id);
      const started = Date.now();
      try {
        const result = await createLlmAdapter(
          toProviderConfig(row),
        ).generateStructured({
          system:
            "You are a connectivity check. Reply only with the requested JSON.",
          prompt: 'Return {"ok": true, "sum": 17 + 25}.',
          schema: z.object({ ok: z.boolean(), sum: z.number() }),
          schemaName: "connectivity_check",
          model: input.model,
          signal: AbortSignal.timeout(90_000),
        });
        return {
          ok: result.output.ok && result.output.sum === 42,
          model: result.model,
          latencyMs: Date.now() - started,
          output: result.output,
        };
      } catch (error) {
        return {
          ok: false,
          error: describeLlmError(error),
          latencyMs: Date.now() - started,
        };
      }
    }),
});
