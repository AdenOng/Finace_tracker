import "server-only";

import { and, eq, gte, gt, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "~/server/db";
import {
  llmProvider,
  llmUsage,
  llmReservation,
  extractionJob,
} from "~/server/db/schema";
import { cachedInstanceSettings } from "~/server/lib/instance-settings-cache";
import { describeLlmError } from "./errors";
import {
  createLlmAdapter,
  LlmError,
  toProviderConfig,
  type LlmAdapter,
  type LlmUsage,
} from "./index";

type ProviderRow = typeof llmProvider.$inferSelect;

/** Usage at or above this share of a monthly limit is flagged on the Status page. */
export const LIMIT_WARNING_SHARE = 0.8;

/** Start of the current calendar month in UTC; monthly limits reset here. */
export function monthStart(now = new Date()) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

/** Input + output tokens spent this month, per provider id. Survives deleted imports. */
export async function monthlyTokenUsage(
  db: Pick<Database, "select">,
  providerIds?: string[],
) {
  if (providerIds?.length === 0) return new Map<string, number>();
  const rows = await db
    .select({
      providerId: llmUsage.providerId,
      tokens:
        sql<number>`coalesce(sum(${llmUsage.inputTokens} + ${llmUsage.outputTokens}), 0)::bigint`.mapWith(
          Number,
        ),
    })
    .from(llmUsage)
    .where(
      and(
        gte(llmUsage.createdAt, monthStart()),
        providerIds ? inArray(llmUsage.providerId, providerIds) : undefined,
      ),
    )
    .groupBy(llmUsage.providerId);
  return new Map(
    rows.flatMap((r) => (r.providerId ? [[r.providerId, r.tokens]] : [])),
  );
}

/** Records tokens spent on one read, whatever happens to the job afterwards. */
export async function recordTokenUsage(
  db: Pick<Database, "insert">,
  entry: {
    providerId: string;
    jobId: string | null;
    model: string | null;
    inputTokens?: number;
    outputTokens?: number;
  },
) {
  const input = entry.inputTokens ?? 0;
  const output = entry.outputTokens ?? 0;
  if (input + output === 0) return;
  await db.insert(llmUsage).values({
    providerId: entry.providerId,
    jobId: entry.jobId,
    model: entry.model,
    inputTokens: input,
    outputTokens: output,
  });
}

/** Includes room for a structured statement response in addition to the input estimate. */
export const IMPORT_RESPONSE_TOKEN_ESTIMATE = 16_384;
/** Rendered pages are capped at 4 MP; providers bill such an image at a few thousand tokens. */
const IMAGE_TOKEN_ESTIMATE = 8_000;
const RESERVATION_TTL_MS = 10 * 60_000;

/** Serialize admission and reconciliation on the provider row across all server processes. */
export async function reserveTokenBudget(
  db: Database,
  providerId: string,
  tokens: number,
) {
  return db.transaction(async (tx) => {
    const [provider] = await tx
      .select()
      .from(llmProvider)
      .where(eq(llmProvider.id, providerId))
      .for("update");
    if (!provider?.isEnabled)
      throw new LlmError("The AI provider is disabled or was removed.");
    const usage = await monthlyTokenUsage(tx, [providerId]);
    const [reserved] = await tx
      .select({
        tokens: sql<number>`coalesce(sum(${llmReservation.tokens}), 0)`.mapWith(
          Number,
        ),
      })
      .from(llmReservation)
      .where(
        and(
          eq(llmReservation.providerId, providerId),
          gt(llmReservation.expiresAt, new Date()),
        ),
      );
    if (
      provider.pauseAtLimit &&
      provider.monthlyTokenLimit !== null &&
      (usage.get(providerId) ?? 0) + (reserved?.tokens ?? 0) + tokens >
        provider.monthlyTokenLimit
    ) {
      throw new LlmError(
        `${provider.name} has insufficient monthly token budget for this read. Try later or ask an admin to raise its limit.`,
      );
    }
    const [reservation] = await tx
      .insert(llmReservation)
      .values({
        providerId,
        tokens,
        expiresAt: new Date(Date.now() + RESERVATION_TTL_MS),
      })
      .returning({ id: llmReservation.id });
    return reservation!.id;
  });
}

export async function reconcileTokenBudget(
  db: Database,
  reservationId: string,
  entry: Parameters<typeof recordTokenUsage>[1],
) {
  await db.transaction(async (tx) => {
    await tx
      .select({ id: llmProvider.id })
      .from(llmProvider)
      .where(eq(llmProvider.id, entry.providerId))
      .for("update");
    // Delete and record in one transaction: admission never sees a gap between them.
    const [reservation] = await tx
      .delete(llmReservation)
      .where(eq(llmReservation.id, reservationId))
      .returning();
    if (reservation) {
      // A user may delete the import while its provider request is still in flight.
      const [job] = entry.jobId
        ? await tx
            .select({ id: extractionJob.id })
            .from(extractionJob)
            .where(eq(extractionJob.id, entry.jobId))
            .for("key share")
        : [];
      await recordTokenUsage(tx, { ...entry, jobId: job?.id ?? null });
    }
  });
}

/** SDK errors may retain usage in a wrapped cause/details (including invalid JSON outputs). */
export function reportedFailureUsage(
  error: unknown,
  depth = 0,
): LlmUsage | undefined {
  if (!error || typeof error !== "object" || depth > 6) return;
  const value = error as Record<string, unknown>;
  for (const key of ["totalUsage", "usage"]) {
    const parsed = z
      .object({
        inputTokens: z.number().int().nonnegative().optional(),
        outputTokens: z.number().int().nonnegative().optional(),
      })
      .safeParse(value[key]);
    if (
      parsed.success &&
      (parsed.data.inputTokens !== undefined ||
        parsed.data.outputTokens !== undefined)
    )
      return parsed.data;
  }
  for (const key of ["details", "cause", "response", "result"]) {
    const usage = reportedFailureUsage(value[key], depth + 1);
    if (usage) return usage;
  }
}

/** Accounting happens at the provider boundary, before extraction validation can fail. */
function budgetedAdapter(
  db: Database,
  row: ProviderRow,
  adapter: LlmAdapter,
  jobId?: string,
): LlmAdapter {
  return {
    listModels: () => adapter.listModels(),
    async generateStructured(request) {
      request.signal?.throwIfAborted();
      // Conservative: ~2 characters per token for text. Vision models bill an image by its
      // pixel size, not its encoded bytes, so each rendered page gets a fixed allowance.
      const estimate =
        IMPORT_RESPONSE_TOKEN_ESTIMATE +
        Math.ceil((request.system.length + request.prompt.length) / 2) +
        (request.files ?? []).reduce(
          (sum, file) =>
            sum +
            (file.mediaType.startsWith("image/")
              ? IMAGE_TOKEN_ESTIMATE
              : Math.max(4096, Math.ceil(file.data.byteLength / 2))),
          0,
        );
      const reservation = await reserveTokenBudget(db, row.id, estimate);
      const entry = {
        providerId: row.id,
        jobId: jobId ?? null,
        model: request.model ?? row.defaultModel,
      };
      let result;
      try {
        request.signal?.throwIfAborted();
        result = await adapter.generateStructured(request);
      } catch (error) {
        await reconcileTokenBudget(db, reservation, {
          ...entry,
          ...reportedFailureUsage(error),
        });
        throw error;
      }
      await reconcileTokenBudget(db, reservation, {
        ...entry,
        model: result.model,
        ...result.usage,
      });
      return result;
    },
  };
}

function isPaused(row: ProviderRow, usage: Map<string, number>) {
  return (
    row.pauseAtLimit &&
    row.monthlyTokenLimit !== null &&
    (usage.get(row.id) ?? 0) >= row.monthlyTokenLimit
  );
}

/**
 * Providers to try for an import, in order: the default, then the admin's fallback. A provider
 * set to pause at its monthly limit is skipped once it has reached it.
 */
export async function importProviders(db: Database, jobId?: string) {
  const fallbackId = cachedInstanceSettings().fallbackProviderId;
  const rows = await db
    .select()
    .from(llmProvider)
    .where(
      and(
        isNull(llmProvider.ownerId),
        eq(llmProvider.isEnabled, true),
        fallbackId
          ? sql`(${llmProvider.isDefault} or ${llmProvider.id} = ${fallbackId})`
          : eq(llmProvider.isDefault, true),
      ),
    );
  const primary = rows.find((r) => r.isDefault) ?? null;
  const fallback =
    rows.find((r) => r.id === fallbackId && !r.isDefault) ?? null;
  const usage = await monthlyTokenUsage(
    db,
    rows.map((r) => r.id),
  );
  const candidates = [primary, fallback].filter(
    (r): r is ProviderRow => r !== null && !isPaused(r, usage),
  );
  if (candidates.length === 0) {
    throw new LlmError(
      primary && isPaused(primary, usage)
        ? `${primary.name} has used its monthly token limit and no fallback is available. An admin can raise the limit under Admin → AI.`
        : "No default AI provider is configured. An admin can set one under Admin → AI.",
    );
  }
  // Adapters are built when each provider is tried, so a fallback whose stored key cannot be
  // decrypted only fails its own attempt instead of the whole import.
  return candidates.map((row) => ({
    provider: row,
    createAdapter: () =>
      budgetedAdapter(db, row, createLlmAdapter(toProviderConfig(row)), jobId),
  }));
}

/**
 * Round-trips a tiny structured request to prove the key, model and JSON mode all work, and
 * stores the outcome on the provider so health survives a reload.
 */
export async function checkProvider(
  db: Pick<Database, "update">,
  row: ProviderRow,
  model?: string,
) {
  const started = Date.now();
  let outcome:
    | { ok: true; model: string; latencyMs: number }
    | { ok: false; error: string; latencyMs: number };
  try {
    const result = await createLlmAdapter(
      toProviderConfig(row),
    ).generateStructured({
      system:
        "You are a connectivity check. Reply only with the requested JSON.",
      prompt: 'Return {"ok": true, "sum": 17 + 25}.',
      schema: z.object({ ok: z.boolean(), sum: z.number() }),
      schemaName: "connectivity_check",
      model,
      signal: AbortSignal.timeout(90_000),
    });
    const latencyMs = Date.now() - started;
    outcome =
      result.output.ok && result.output.sum === 42
        ? { ok: true, model: result.model, latencyMs }
        : {
            ok: false,
            error: "The model answered, but not with the expected JSON.",
            latencyMs,
          };
  } catch (error) {
    outcome = {
      ok: false,
      error: describeLlmError(error),
      latencyMs: Date.now() - started,
    };
  }
  // A one-off model override in the test is not the provider's health.
  if (!model) {
    await db
      .update(llmProvider)
      .set({
        lastTestedAt: new Date(),
        lastTestOk: outcome.ok,
        lastTestError: outcome.ok ? null : outcome.error.slice(0, 500),
        lastTestLatencyMs: outcome.latencyMs,
      })
      .where(eq(llmProvider.id, row.id));
  }
  return outcome;
}
