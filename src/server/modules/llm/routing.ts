import "server-only";

import { and, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "~/server/db";
import { llmProvider, llmUsage } from "~/server/db/schema";
import { cachedInstanceSettings } from "~/server/lib/instance-settings-cache";
import { describeLlmError } from "./errors";
import { createLlmAdapter, LlmError, toProviderConfig } from "./index";

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
    jobId: string;
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
export async function importProviders(db: Database) {
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
    createAdapter: () => createLlmAdapter(toProviderConfig(row)),
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
