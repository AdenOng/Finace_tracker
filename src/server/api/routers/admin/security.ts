import { and, count, desc, eq, gt, ilike, lt, or, sql } from "drizzle-orm";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { twoFactorPolicy } from "~/server/auth/enrollment";
import { signInEvent, user } from "~/server/db/schema";
import { recordAudit } from "~/server/lib/audit";
import {
  cachedInstanceSettings,
  updateInstanceSettings,
} from "~/server/lib/instance-settings";
import { isEmailConfigured } from "~/server/lib/mailer";

const PAGE_SIZE = 50;
const DAY_MS = 86_400_000;

export const adminSecurityRouter = createTRPCRouter({
  settings: adminProcedure.query(async ({ ctx }) => {
    const settings = cachedInstanceSettings();
    const { policy, forcedByEnv } = twoFactorPolicy();
    const [missing] = await ctx.db
      .select({
        admins: sql<number>`count(*) filter (where ${user.role} = 'admin' and not coalesce(${user.twoFactorEnabled}, false))::int`,
        members: sql<number>`count(*) filter (where coalesce(${user.role}, 'user') <> 'admin' and not coalesce(${user.twoFactorEnabled}, false))::int`,
      })
      .from(user);
    return {
      twoFactorPolicy: policy,
      twoFactorForcedByEnv: forcedByEnv,
      maxSessionDays: settings.maxSessionDays,
      workspaceInviteSignups: settings.workspaceInviteSignups,
      newDeviceAlerts: settings.newDeviceAlerts,
      emailConfigured: isEmailConfigured(),
      withoutTwoFactor: missing ?? { admins: 0, members: 0 },
    };
  }),

  updateSettings: adminProcedure
    .input(
      z.object({
        twoFactorPolicy: z.enum(["everyone", "admins", "off"]),
        maxSessionDays: z.number().int().min(1).max(365).nullable(),
        workspaceInviteSignups: z.boolean(),
        newDeviceAlerts: z.boolean(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const before = cachedInstanceSettings();
      await updateInstanceSettings(ctx.db, input);
      const changed = Object.fromEntries(
        Object.entries(input).filter(
          ([key, value]) =>
            before[key as keyof typeof input] !== value &&
            // A null policy and "off" mean the same thing.
            !(key === "twoFactorPolicy" && value === "off" && !before[key]),
        ),
      );
      if (Object.keys(changed).length) {
        await recordAudit(ctx.db, {
          actorId: ctx.session.user.id,
          action: "settings.security_updated",
          targetType: "settings",
          targetLabel: "Security policy",
          details: changed,
        });
      }
    }),

  /** Last week at a glance, for the Status page and the top of Security. */
  summary: adminProcedure.query(async ({ ctx }) => {
    const since = new Date(Date.now() - 7 * DAY_MS);
    const [totals] = await ctx.db
      .select({
        succeeded: sql<number>`count(*) filter (where ${signInEvent.success})::int`,
        failed: sql<number>`count(*) filter (where not ${signInEvent.success})::int`,
        newDevices: sql<number>`count(*) filter (where ${signInEvent.newDevice})::int`,
      })
      .from(signInEvent)
      .where(gt(signInEvent.createdAt, since));
    const noisyAddresses = await ctx.db
      .select({ ipAddress: signInEvent.ipAddress, failures: count() })
      .from(signInEvent)
      .where(
        and(
          gt(signInEvent.createdAt, since),
          eq(signInEvent.success, false),
          sql`${signInEvent.ipAddress} is not null`,
        ),
      )
      .groupBy(signInEvent.ipAddress)
      .having(sql`count(*) >= 3`)
      .orderBy(desc(count()))
      .limit(5);
    return {
      ...(totals ?? { succeeded: 0, failed: 0, newDevices: 0 }),
      noisyAddresses,
    };
  }),

  signIns: adminProcedure
    .input(
      z.object({
        outcome: z.enum(["all", "failed", "new_device"]).default("all"),
        userId: z.string().optional(),
        query: z.string().trim().max(100).optional(),
        cursor: z.date().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const pattern = input.query ? `%${input.query}%` : null;
      const rows = await ctx.db
        .select({
          id: signInEvent.id,
          createdAt: signInEvent.createdAt,
          success: signInEvent.success,
          method: signInEvent.method,
          reason: signInEvent.reason,
          email: signInEvent.email,
          ipAddress: signInEvent.ipAddress,
          device: signInEvent.device,
          userAgent: signInEvent.userAgent,
          newDevice: signInEvent.newDevice,
          userId: signInEvent.userId,
          userName: user.name,
        })
        .from(signInEvent)
        .leftJoin(user, eq(user.id, signInEvent.userId))
        .where(
          and(
            input.outcome === "failed"
              ? eq(signInEvent.success, false)
              : input.outcome === "new_device"
                ? eq(signInEvent.newDevice, true)
                : undefined,
            input.userId ? eq(signInEvent.userId, input.userId) : undefined,
            pattern
              ? or(
                  ilike(signInEvent.email, pattern),
                  ilike(signInEvent.ipAddress, pattern),
                  ilike(user.name, pattern),
                )
              : undefined,
            input.cursor ? lt(signInEvent.createdAt, input.cursor) : undefined,
          ),
        )
        .orderBy(desc(signInEvent.createdAt))
        .limit(PAGE_SIZE + 1);
      const hasMore = rows.length > PAGE_SIZE;
      const items = hasMore ? rows.slice(0, PAGE_SIZE) : rows;
      return {
        items,
        nextCursor: hasMore ? (items.at(-1)?.createdAt ?? null) : null,
      };
    }),
});
