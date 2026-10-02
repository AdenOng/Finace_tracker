import { TRPCError } from "@trpc/server";
import { asc, isNull } from "drizzle-orm";
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
      return row;
    }),

  update: adminProcedure
    .input(providerInput.extend({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const { id, apiKey, ...values } = input;
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
    }),

  remove: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [row] = await ctx.db
        .delete(llmProvider)
        .where(sharedProviderFilter(input.id))
        .returning({ id: llmProvider.id });
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    }),

  setDefault: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      await ctx.db.transaction(async (tx) => {
        if (!(await findSharedProvider(tx, input.id))) {
          throw new TRPCError({ code: "NOT_FOUND" });
        }
        await tx
          .update(llmProvider)
          .set({ isDefault: false })
          .where(isNull(llmProvider.ownerId));
        await tx
          .update(llmProvider)
          .set({ isDefault: true, isEnabled: true })
          .where(sharedProviderFilter(input.id));
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
