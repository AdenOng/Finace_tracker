import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { env } from "~/env";
import { builtInPack, builtInPackIds, parsePresetPack } from "~/presets";
import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { presetDiff } from "~/server/db/seed/defaults";
import { seedCatalog } from "~/server/db/seed/catalog";
import { recordAudit } from "~/server/lib/audit";
import {
  cachedInstanceSettings,
  updateInstanceSettings,
} from "~/server/lib/instance-settings";
import { activePresetPack } from "~/server/lib/preset";
import {
  backupServiceStatus,
  listBackups,
  requestBackup,
} from "~/server/modules/backups";
import {
  purgeOldDocuments,
  retentionPreview,
  storageStats,
} from "~/server/modules/imports/retention";
import {
  marketHealth,
  refreshExchangeRates,
} from "~/server/modules/portfolio/market-health";

/** A pack chosen in the console: a built-in id, or the JSON of a custom pack file. */
const packSource = z.union([
  z.object({ builtIn: z.string() }),
  z.object({ json: z.string().max(2_000_000) }),
]);

function resolvePack(source: z.infer<typeof packSource>) {
  if ("builtIn" in source) {
    const pack = builtInPack(source.builtIn);
    if (!pack) throw new TRPCError({ code: "NOT_FOUND" });
    return pack;
  }
  try {
    return parsePresetPack(JSON.parse(source.json));
  } catch (error) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message:
        error instanceof SyntaxError
          ? "That file is not valid JSON."
          : "That file is not a Finfolio preset pack. Check it against src/presets/types.ts.",
    });
  }
}

function packCounts(pack: Awaited<ReturnType<typeof activePresetPack>>) {
  const countCategories = (nodes: typeof pack.categories): number =>
    nodes.reduce((n, c) => n + 1 + countCategories(c.children ?? []), 0);
  return {
    categories: countCategories(pack.categories),
    institutions: pack.institutions.length,
    currencies: pack.currencies.length,
  };
}

export const adminDataRouter = createTRPCRouter({
  backups: adminProcedure.query(async () => {
    const [list, service] = await Promise.all([
      listBackups(),
      backupServiceStatus(),
    ]);
    return { ...list, service };
  }),

  requestBackup: adminProcedure.mutation(async ({ ctx }) => {
    try {
      await requestBackup();
    } catch {
      throw new TRPCError({
        code: "INTERNAL_SERVER_ERROR",
        message: `Could not write to ${env.BACKUP_DIR}/control. Check that the backup folder is mounted and writable.`,
      });
    }
    await recordAudit(ctx.db, {
      actorId: ctx.session.user.id,
      action: "backup.requested",
      targetType: "backup",
    });
  }),

  market: adminProcedure.query(({ ctx }) => marketHealth(ctx.db)),

  refreshRates: adminProcedure.mutation(async ({ ctx }) => {
    const result = await refreshExchangeRates(ctx.db, { force: true });
    await recordAudit(ctx.db, {
      actorId: ctx.session.user.id,
      action: "settings.rates_refreshed",
      targetType: "settings",
      targetLabel: "Exchange rates",
      details: {
        currencies: result.currencies.join(", "),
        stored: result.stored,
      },
    });
    return result;
  }),

  storage: adminProcedure.query(async ({ ctx }) => {
    const days = cachedInstanceSettings().documentRetentionDays;
    return {
      retentionDays: days,
      stats: await storageStats(ctx.db),
      eligible: days ? await retentionPreview(ctx.db, days) : null,
    };
  }),

  retentionPreview: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(3650) }))
    .query(({ ctx, input }) => retentionPreview(ctx.db, input.days)),

  setRetention: adminProcedure
    .input(z.object({ days: z.number().int().min(1).max(3650).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await updateInstanceSettings(ctx.db, {
        documentRetentionDays: input.days,
      });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "settings.retention_updated",
        targetType: "settings",
        targetLabel: "Statement file retention",
        details: { days: input.days ?? "keep forever" },
      });
    }),

  purgeNow: adminProcedure.mutation(async ({ ctx }) => {
    const days = cachedInstanceSettings().documentRetentionDays;
    if (!days) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Set how long to keep files first",
      });
    }
    const result = await purgeOldDocuments(ctx.db, days);
    await recordAudit(ctx.db, {
      actorId: ctx.session.user.id,
      action: "settings.files_purged",
      targetType: "settings",
      targetLabel: "Statement files",
      details: { files: result.files },
    });
    return result;
  }),

  presets: adminProcedure.query(async ({ ctx }) => {
    const active = await activePresetPack();
    const override = cachedInstanceSettings().cpfSrsEnabled;
    return {
      active: {
        id: active.id,
        name: active.name,
        source: env.PRESET_FILE ? ("file" as const) : ("built_in" as const),
        file: env.PRESET_FILE ?? null,
        counts: packCounts(active),
        features: active.features,
        diff: await presetDiff(ctx.db, active),
      },
      builtIn: builtInPackIds.map((id) => {
        const pack = builtInPack(id)!;
        return { id, name: pack.name, counts: packCounts(pack) };
      }),
      cpfSrs: {
        override,
        effective: override ?? active.features.cpfSrs,
      },
    };
  }),

  previewPack: adminProcedure
    .input(packSource)
    .mutation(async ({ ctx, input }) => {
      const pack = resolvePack(input);
      return {
        name: pack.name,
        counts: packCounts(pack),
        diff: await presetDiff(ctx.db, pack),
      };
    }),

  /** Insert-only, like startup seeding: adds what is missing and never overwrites admin edits. */
  applyPack: adminProcedure
    .input(packSource)
    .mutation(async ({ ctx, input }) => {
      const pack = resolvePack(input);
      const report = await seedCatalog(ctx.db, pack);
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "preset.applied",
        targetType: "preset",
        targetLabel: pack.name,
        details: {
          categories: report.categories,
          institutions: report.institutions,
          currencies: report.currencies,
        },
      });
      return report;
    }),

  setCpfSrs: adminProcedure
    .input(z.object({ enabled: z.boolean().nullable() }))
    .mutation(async ({ ctx, input }) => {
      await updateInstanceSettings(ctx.db, { cpfSrsEnabled: input.enabled });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "settings.cpf_srs_updated",
        targetType: "settings",
        targetLabel: "CPF & SRS accounts",
        details: {
          enabled: input.enabled ?? "follow pack",
        },
      });
    }),
});
