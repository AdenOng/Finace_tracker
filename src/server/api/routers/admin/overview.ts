import { and, count, desc, eq, gt, isNull, sql, sum } from "drizzle-orm";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import {
  extractionJob,
  invitation,
  llmProvider,
  session,
  user,
} from "~/server/db/schema";

const DAY_MS = 86_400_000;

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
        providerId: extractionJob.providerId,
        providerName: llmProvider.name,
        jobs: count(),
        inputTokens: sum(extractionJob.inputTokens).mapWith(Number),
        outputTokens: sum(extractionJob.outputTokens).mapWith(Number),
      })
      .from(extractionJob)
      .leftJoin(llmProvider, eq(llmProvider.id, extractionJob.providerId))
      .where(gt(extractionJob.createdAt, monthAgo))
      .groupBy(extractionJob.providerId, llmProvider.name)
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

  /**
   * Recent failed extraction jobs for troubleshooting. Metadata only: never the document, its file
   * name, the extracted result or staged rows, which belong to the user.
   */
  failedJobs: adminProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select({
        id: extractionJob.id,
        createdAt: extractionJob.createdAt,
        finishedAt: extractionJob.finishedAt,
        attempts: extractionJob.attempts,
        model: extractionJob.model,
        providerName: llmProvider.name,
        ownerName: user.name,
        error: extractionJob.error,
      })
      .from(extractionJob)
      .innerJoin(user, eq(user.id, extractionJob.ownerId))
      .leftJoin(llmProvider, eq(llmProvider.id, extractionJob.providerId))
      .where(eq(extractionJob.status, "failed"))
      .orderBy(desc(extractionJob.createdAt))
      .limit(25);
    // Provider errors can echo fragments of the request; keep only the gist.
    return rows.map((row) => ({
      ...row,
      error:
        row.error && row.error.length > 240
          ? `${row.error.slice(0, 240)}…`
          : row.error,
    }));
  }),
});
