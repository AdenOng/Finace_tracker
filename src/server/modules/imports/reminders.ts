import { and, eq, inArray, isNull, lt } from "drizzle-orm";

import { env } from "~/env";
import type { Database } from "~/server/db";
import { extractionJob, user } from "~/server/db/schema";
import { isEmailConfigured, trySendMail } from "~/server/lib/mailer";

/** Imports read but not reviewed for this long are flagged, and their owner reminded once. */
export const REVIEW_WAITING_DAYS = 7;

export function reviewReminderEmail(name: string, count: number) {
  return {
    subject:
      count === 1
        ? "A statement is waiting for your review in Finfolio"
        : `${count} statements are waiting for your review in Finfolio`,
    text: [
      `Hi ${name},`,
      "",
      count === 1
        ? "Finfolio has read a statement you uploaded. Nothing is saved to your accounts until you review it:"
        : `Finfolio has read ${count} statements you uploaded. Nothing is saved to your accounts until you review them:`,
      `${env.BETTER_AUTH_URL}/imports`,
    ].join("\n"),
  };
}

/**
 * Emails each person whose imports have waited for review longer than `REVIEW_WAITING_DAYS`, one
 * email for all of them. Each import is reminded about once, whether by this or by an admin.
 */
export async function sendReviewReminders(db: Database, now = Date.now()) {
  if (!isEmailConfigured()) return { emails: 0, imports: 0 };
  const waiting = await db
    .select({
      id: extractionJob.id,
      ownerId: extractionJob.ownerId,
      name: user.name,
      email: user.email,
    })
    .from(extractionJob)
    .innerJoin(user, eq(user.id, extractionJob.ownerId))
    .where(
      and(
        eq(extractionJob.status, "needs_review"),
        lt(
          extractionJob.finishedAt,
          new Date(now - REVIEW_WAITING_DAYS * 86_400_000),
        ),
        isNull(extractionJob.reviewRemindedAt),
      ),
    );
  const byOwner = new Map<string, typeof waiting>();
  for (const job of waiting)
    byOwner.set(job.ownerId, [...(byOwner.get(job.ownerId) ?? []), job]);

  let emails = 0;
  let imports = 0;
  for (const jobs of byOwner.values()) {
    const { name, email } = jobs[0]!;
    // A failed send is tried again on the next run.
    const error = await trySendMail({
      to: email,
      ...reviewReminderEmail(name, jobs.length),
    });
    if (error) continue;
    await db
      .update(extractionJob)
      .set({ reviewRemindedAt: new Date(now) })
      .where(
        inArray(
          extractionJob.id,
          jobs.map((j) => j.id),
        ),
      );
    emails++;
    imports += jobs.length;
  }
  return { emails, imports };
}
