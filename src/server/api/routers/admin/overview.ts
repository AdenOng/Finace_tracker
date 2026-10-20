import {
  and,
  count,
  desc,
  eq,
  gt,
  isNull,
  max,
  or,
  sql,
  sum,
} from "drizzle-orm";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { twoFactorPolicy } from "~/server/auth/enrollment";
import {
  extractionJob,
  fxRate,
  invitation,
  llmProvider,
  llmUsage,
  session,
  signInEvent,
  user,
  userSettings,
} from "~/server/db/schema";
import { backupServiceStatus, listBackups } from "~/server/modules/backups";
import {
  LIMIT_WARNING_SHARE,
  monthlyTokenUsage,
} from "~/server/modules/llm/routing";
import { REVIEW_WAITING_DAYS } from "./jobs";

const DAY_MS = 86_400_000;
const STALE_AFTER_MS = 6 * 60_000;
const BACKUP_OVERDUE_DAYS = 2;
const FX_STALE_DAYS = 4;

/**
 * A timestamp parameter for raw SQL. The postgres-js driver takes timestamps as strings, so a Date
 * cannot be interpolated directly.
 */
const at = (ms: number) => sql`${new Date(ms).toISOString()}::timestamptz`;

export type AttentionItem = {
  tone: "error" | "warn" | "info";
  title: string;
  detail?: string;
  href: string;
  action: string;
};

export const adminOverviewRouter = createTRPCRouter({
  stats: adminProcedure.query(async ({ ctx }) => {
    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const monthAgo = new Date(now.getTime() - 30 * DAY_MS);

    const [users] = await ctx.db
      .select({
        total: count(),
        admins: sql<number>`count(*) filter (where ${user.role} = 'admin')::int`,
        disabled: sql<number>`count(*) filter (where ${user.banned})::int`,
        twoFactor: sql<number>`count(*) filter (where ${user.twoFactorEnabled})::int`,
      })
      .from(user);
    const [activity] = await ctx.db
      .select({
        sessions: count(),
        activeUsers: sql<number>`count(distinct ${session.userId})::int`,
      })
      .from(session)
      .where(and(gt(session.expiresAt, now), gt(session.updatedAt, monthAgo)));
    const pendingInvites = await ctx.db.$count(
      invitation,
      and(
        isNull(invitation.acceptedAt),
        isNull(invitation.revokedAt),
        gt(invitation.expiresAt, now),
      ),
    );
    const jobsByStatus = await ctx.db
      .select({ status: extractionJob.status, count: count() })
      .from(extractionJob)
      .where(gt(extractionJob.createdAt, weekAgo))
      .groupBy(extractionJob.status);
    const usage = await ctx.db
      .select({
        providerId: llmUsage.providerId,
        providerName: llmProvider.name,
        model: llmUsage.model,
        jobs: count(),
        inputTokens: sum(llmUsage.inputTokens).mapWith(Number),
        outputTokens: sum(llmUsage.outputTokens).mapWith(Number),
      })
      .from(llmUsage)
      .leftJoin(llmProvider, eq(llmProvider.id, llmUsage.providerId))
      .where(gt(llmUsage.createdAt, monthAgo))
      .groupBy(llmUsage.providerId, llmProvider.name, llmUsage.model)
      .orderBy(desc(count()));
    const [defaultProvider] = await ctx.db
      .select({ name: llmProvider.name })
      .from(llmProvider)
      .where(
        and(
          isNull(llmProvider.ownerId),
          eq(llmProvider.isDefault, true),
          eq(llmProvider.isEnabled, true),
        ),
      )
      .limit(1);

    return {
      users: users ?? { total: 0, admins: 0, disabled: 0, twoFactor: 0 },
      activeUsers: activity?.activeUsers ?? 0,
      activeSessions: activity?.sessions ?? 0,
      pendingInvites,
      jobsByStatus,
      usage,
      defaultProvider: defaultProvider?.name ?? null,
    };
  }),

  /** Everything an admin should look at, most urgent first. Empty when all is well. */
  attention: adminProcedure.query(async ({ ctx }) => {
    const items: AttentionItem[] = [];
    const now = Date.now();

    const providers = await ctx.db
      .select()
      .from(llmProvider)
      .where(and(isNull(llmProvider.ownerId), eq(llmProvider.isEnabled, true)));
    if (!providers.some((p) => p.isDefault)) {
      items.push({
        tone: "error",
        title: "No default AI provider, so imports will fail",
        href: "/admin/ai",
        action: "Set one up",
      });
    }
    for (const p of providers.filter((p) => p.lastTestOk === false)) {
      items.push({
        tone: p.isDefault ? "error" : "warn",
        title: `${p.name} failed its last check`,
        detail: p.lastTestError ?? undefined,
        href: "/admin/ai",
        action: "Open providers",
      });
    }
    const usage = await monthlyTokenUsage(
      ctx.db,
      providers.map((p) => p.id),
    );
    for (const p of providers) {
      if (!p.monthlyTokenLimit) continue;
      const share = (usage.get(p.id) ?? 0) / p.monthlyTokenLimit;
      if (share < LIMIT_WARNING_SHARE) continue;
      items.push({
        tone: share >= 1 && p.pauseAtLimit ? "error" : "warn",
        title:
          share >= 1
            ? `${p.name} has used its monthly token limit${p.pauseAtLimit ? " and is paused" : ""}`
            : `${p.name} has used ${Math.round(share * 100)}% of its monthly token limit`,
        href: "/admin/ai/usage",
        action: "See usage",
      });
    }

    const staleBefore = at(now - STALE_AFTER_MS);
    const [jobs] = await ctx.db
      .select({
        stuck: sql<number>`count(*) filter (where (${extractionJob.status} = 'running' and ${extractionJob.startedAt} < ${staleBefore}) or (${extractionJob.status} = 'queued' and ${extractionJob.createdAt} < ${staleBefore}))::int`,
        failed: sql<number>`count(*) filter (where ${extractionJob.status} = 'failed' and ${extractionJob.createdAt} > ${at(now - 7 * DAY_MS)})::int`,
        waiting: sql<number>`count(*) filter (where ${extractionJob.status} = 'needs_review' and ${extractionJob.finishedAt} < ${at(now - REVIEW_WAITING_DAYS * DAY_MS)})::int`,
      })
      .from(extractionJob);
    if (jobs?.stuck) {
      items.push({
        tone: "warn",
        title: `${jobs.stuck} import${jobs.stuck === 1 ? " is" : "s are"} stuck`,
        detail:
          "Queued or running for over six minutes, usually after a restart.",
        href: "/admin/imports?filter=stuck",
        action: "Review",
      });
    }
    if (jobs?.failed) {
      items.push({
        tone: "warn",
        title: `${jobs.failed} import${jobs.failed === 1 ? "" : "s"} failed this week`,
        href: "/admin/imports?filter=failed",
        action: "See errors",
      });
    }
    if (jobs?.waiting) {
      items.push({
        tone: "info",
        title: `${jobs.waiting} statement${jobs.waiting === 1 ? " has" : "s have"} waited over ${REVIEW_WAITING_DAYS} days for review`,
        href: "/admin/imports?filter=waiting",
        action: "See who",
      });
    }

    const { policy } = twoFactorPolicy();
    const [missing] = await ctx.db
      .select({
        admins: sql<number>`count(*) filter (where ${user.role} = 'admin' and not coalesce(${user.twoFactorEnabled}, false))::int`,
        everyone: sql<number>`count(*) filter (where not coalesce(${user.twoFactorEnabled}, false))::int`,
      })
      .from(user)
      .where(or(isNull(user.banned), eq(user.banned, false)));
    const uncovered =
      policy === "everyone" ? (missing?.everyone ?? 0) : (missing?.admins ?? 0);
    if (uncovered > 0) {
      items.push({
        tone: "warn",
        title:
          policy === "everyone"
            ? `${uncovered} ${uncovered === 1 ? "person has" : "people have"} not set up two-step yet`
            : `${uncovered} admin${uncovered === 1 ? " has" : "s have"} no two-step verification`,
        detail:
          policy === "everyone"
            ? "They will be asked to set it up at their next sign-in."
            : "Admins can change every setting here; protect their accounts first.",
        href: "/admin/users?filter=no2fa",
        action: "See who",
      });
    }

    const [signIns] = await ctx.db
      .select({
        failed: sql<number>`count(*) filter (where not ${signInEvent.success} and ${signInEvent.createdAt} > ${at(now - DAY_MS)})::int`,
        newDevices: sql<number>`count(*) filter (where ${signInEvent.newDevice} and ${signInEvent.createdAt} > ${at(now - 7 * DAY_MS)})::int`,
      })
      .from(signInEvent);
    if ((signIns?.failed ?? 0) >= 5) {
      items.push({
        tone: "warn",
        title: `${signIns!.failed} failed sign-ins in the last day`,
        href: "/admin/security?outcome=failed",
        action: "Look into it",
      });
    }
    if (signIns?.newDevices) {
      items.push({
        tone: "info",
        title: `${signIns.newDevices} sign-in${signIns.newDevices === 1 ? "" : "s"} from a new device this week`,
        href: "/admin/security?outcome=new_device",
        action: "Check them",
      });
    }

    const [backups, service] = await Promise.all([
      listBackups(),
      backupServiceStatus(),
    ]);
    const latestBackup = backups.backups[0]?.createdAt;
    if (service.lastRun && !service.lastRun.ok) {
      items.push({
        tone: "error",
        title: "The last database backup failed",
        detail: service.lastRun.error ?? undefined,
        href: "/admin/data",
        action: "Open backups",
      });
    } else if (
      !latestBackup ||
      now - latestBackup.getTime() > BACKUP_OVERDUE_DAYS * DAY_MS
    ) {
      items.push({
        tone: "warn",
        title: latestBackup
          ? `No database backup for ${Math.floor((now - latestBackup.getTime()) / DAY_MS)} days`
          : "No database backups found",
        detail: service.running
          ? undefined
          : "The backup service is not running.",
        href: "/admin/data",
        action: "Open backups",
      });
    }

    const displayCurrencies = await ctx.db
      .selectDistinct({ code: userSettings.displayCurrency })
      .from(userSettings);
    const fxBefore = new Date(now - FX_STALE_DAYS * DAY_MS)
      .toISOString()
      .slice(0, 10);
    for (const { code } of displayCurrencies) {
      const [row] = await ctx.db
        .select({ latest: max(fxRate.date) })
        .from(fxRate)
        .where(or(eq(fxRate.base, code), eq(fxRate.quote, code)));
      if (row?.latest && row.latest < fxBefore) {
        items.push({
          tone: "warn",
          title: `Exchange rates into ${code} are from ${row.latest}`,
          href: "/admin/data/market",
          action: "Refresh",
        });
      }
    }

    const order = { error: 0, warn: 1, info: 2 } as const;
    return items.sort((a, b) => order[a.tone] - order[b.tone]);
  }),
});
