import { TRPCError } from "@trpc/server";
import { and, desc, eq, ilike, inArray, lt, or, sql } from "drizzle-orm";
import { after } from "next/server";
import { z } from "zod";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import type { Database } from "~/server/db";
import {
  document,
  extractionJob,
  jobStatus,
  llmProvider,
  user,
} from "~/server/db/schema";
import { recordAudit } from "~/server/lib/audit";
import { trySendMail } from "~/server/lib/mailer";
import {
  REVIEW_WAITING_DAYS,
  reviewReminderEmail,
} from "~/server/modules/imports/reminders";
import {
  isStaleJob,
  runImportJob,
  staleJobCondition,
} from "~/server/modules/imports/runner";

const PAGE_SIZE = 50;

const filter = z.enum([...jobStatus.enumValues, "stuck", "waiting", "all"]);

function filterCondition(value: z.infer<typeof filter>) {
  const waitingBefore = new Date(Date.now() - REVIEW_WAITING_DAYS * 86_400_000);
  if (value === "all") return undefined;
  if (value === "stuck") return staleJobCondition();
  if (value === "waiting")
    return and(
      eq(extractionJob.status, "needs_review"),
      lt(extractionJob.finishedAt, waitingBefore),
    );
  return eq(extractionJob.status, value);
}

async function loadJob(db: Database, id: string) {
  const [job] = await db
    .select({
      id: extractionJob.id,
      status: extractionJob.status,
      startedAt: extractionJob.startedAt,
      updatedAt: extractionJob.updatedAt,
      ownerId: extractionJob.ownerId,
      ownerEmail: user.email,
      ownerName: user.name,
    })
    .from(extractionJob)
    .innerJoin(user, eq(user.id, extractionJob.ownerId))
    .where(eq(extractionJob.id, id))
    .limit(1);
  if (!job) throw new TRPCError({ code: "NOT_FOUND" });
  return job;
}

/**
 * Every user's import jobs, for troubleshooting. Metadata only: never the document's name or
 * contents, the extracted result or staged rows, which belong to the user.
 */
export const adminJobsRouter = createTRPCRouter({
  counts: adminProcedure.query(async ({ ctx }) => {
    const rows = await Promise.all(
      (["all", ...jobStatus.enumValues, "stuck", "waiting"] as const).map(
        async (value) =>
          [
            value,
            await ctx.db.$count(extractionJob, filterCondition(value)),
          ] as const,
      ),
    );
    return Object.fromEntries(rows) as Record<z.infer<typeof filter>, number>;
  }),

  list: adminProcedure
    .input(
      z.object({
        filter: filter.default("all"),
        query: z.string().trim().max(100).optional(),
        cursor: z.date().nullish(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const pattern = input.query ? `%${input.query}%` : null;
      const rows = await ctx.db
        .select({
          id: extractionJob.id,
          status: extractionJob.status,
          createdAt: extractionJob.createdAt,
          updatedAt: extractionJob.updatedAt,
          startedAt: extractionJob.startedAt,
          finishedAt: extractionJob.finishedAt,
          attempts: extractionJob.attempts,
          model: extractionJob.model,
          inputTokens: extractionJob.inputTokens,
          outputTokens: extractionJob.outputTokens,
          providerName: llmProvider.name,
          ownerName: user.name,
          ownerEmail: user.email,
          error: extractionJob.error,
          documentKind: document.kind,
          mimeType: document.mimeType,
          sizeBytes: document.sizeBytes,
          filePurged: sql<boolean>`${document.filePurgedAt} is not null`,
        })
        .from(extractionJob)
        .innerJoin(user, eq(user.id, extractionJob.ownerId))
        .innerJoin(document, eq(document.id, extractionJob.documentId))
        .leftJoin(llmProvider, eq(llmProvider.id, extractionJob.providerId))
        .where(
          and(
            filterCondition(input.filter),
            pattern
              ? or(ilike(user.name, pattern), ilike(user.email, pattern))
              : undefined,
            input.cursor
              ? lt(extractionJob.createdAt, input.cursor)
              : undefined,
          ),
        )
        .orderBy(desc(extractionJob.createdAt))
        .limit(PAGE_SIZE + 1);
      const hasMore = rows.length > PAGE_SIZE;
      const items = (hasMore ? rows.slice(0, PAGE_SIZE) : rows).map((row) => ({
        ...row,
        stale: isStaleJob(row),
        // Provider errors can echo fragments of the request; keep only the gist.
        error:
          row.error && row.error.length > 240
            ? `${row.error.slice(0, 240)}…`
            : row.error,
      }));
      return {
        items,
        nextCursor: hasMore ? (items.at(-1)?.createdAt ?? null) : null,
      };
    }),

  retry: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await loadJob(ctx.db, input.id);
      if (job.status !== "failed" && !isStaleJob(job)) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only a failed or stuck import can be read again",
        });
      }
      await ctx.db
        .update(extractionJob)
        .set({ status: "queued", error: null })
        .where(
          and(
            eq(extractionJob.id, job.id),
            inArray(extractionJob.status, ["failed", "running", "queued"]),
          ),
        );
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "job.retried",
        targetType: "job",
        targetId: job.id,
        targetLabel: job.ownerEmail,
      });
      after(() => runImportJob(job.id));
    }),

  /** Stops a queued or running read. Its file stays, so the owner can retry from Imports. */
  cancel: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await loadJob(ctx.db, input.id);
      const [row] = await ctx.db
        .update(extractionJob)
        .set({
          status: "failed",
          error: "Stopped by an admin. Read it again from Imports.",
          finishedAt: new Date(),
        })
        .where(
          and(
            eq(extractionJob.id, job.id),
            inArray(extractionJob.status, ["queued", "running"]),
          ),
        )
        .returning({ id: extractionJob.id });
      if (!row)
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only a queued or running import can be stopped",
        });
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "job.cancelled",
        targetType: "job",
        targetId: job.id,
        targetLabel: job.ownerEmail,
      });
    }),

  /** Emails the owner that a statement is waiting for their review. */
  remind: adminProcedure
    .input(z.object({ id: z.uuid() }))
    .mutation(async ({ ctx, input }) => {
      const job = await loadJob(ctx.db, input.id);
      if (job.status !== "needs_review")
        throw new TRPCError({
          code: "CONFLICT",
          message: "Only imports waiting for review need a reminder",
        });
      const error = await trySendMail({
        to: job.ownerEmail,
        ...reviewReminderEmail(job.ownerName, 1),
      });
      if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error });
      // The daily reminder then leaves this import alone.
      await ctx.db
        .update(extractionJob)
        .set({ reviewRemindedAt: new Date() })
        .where(eq(extractionJob.id, job.id));
      await recordAudit(ctx.db, {
        actorId: ctx.session.user.id,
        action: "job.reminder_sent",
        targetType: "job",
        targetId: job.id,
        targetLabel: job.ownerEmail,
      });
    }),
});
