import { and, eq, isNull } from "drizzle-orm";

import { db } from "~/server/db";
import { llmProvider } from "~/server/db/schema";
import { loadInstanceSettings } from "~/server/lib/instance-settings";
import { cachedInstanceSettings } from "~/server/lib/instance-settings-cache";
import { checkProvider } from "~/server/modules/llm/routing";
import { purgeOldDocuments } from "~/server/modules/imports/retention";
import { sendReviewReminders } from "~/server/modules/imports/reminders";
import { recoverImportJobs } from "~/server/modules/imports/runner";
import { recordAllNetWorth } from "~/server/modules/portfolio/history";
import {
  refreshExchangeRates,
  refreshQuotes,
} from "~/server/modules/portfolio/market-health";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

type Task = {
  name: string;
  every: number;
  /** Delay before the first run, so startup is not slowed down. */
  firstAfter: number;
  run: () => Promise<unknown>;
};

const tasks: Task[] = [
  {
    // Other processes (or a manual DB edit) can change settings; keep this copy close.
    name: "settings",
    every: 30_000,
    firstAfter: 30_000,
    run: () => loadInstanceSettings(db),
  },
  {
    // Uploads read their statement right after responding; a restart can lose that read.
    name: "import recovery",
    every: 5 * MINUTE,
    firstAfter: MINUTE,
    run: async () => {
      const result = await recoverImportJobs();
      if (result.interrupted || result.started)
        console.log(
          `[scheduler] imports: ${result.interrupted} interrupted, ${result.started} restarted`,
        );
    },
  },
  {
    name: "provider health",
    every: 6 * HOUR,
    firstAfter: 2 * MINUTE,
    run: async () => {
      if (!cachedInstanceSettings().providerHealthChecks) return;
      const rows = await db
        .select()
        .from(llmProvider)
        .where(
          and(isNull(llmProvider.ownerId), eq(llmProvider.isEnabled, true)),
        );
      for (const row of rows) await checkProvider(db, row);
    },
  },
  {
    name: "document retention",
    every: 24 * HOUR,
    firstAfter: 5 * MINUTE,
    run: async () => {
      const days = cachedInstanceSettings().documentRetentionDays;
      if (!days) return;
      const result = await purgeOldDocuments(db, days);
      if (result.files)
        console.log(`[scheduler] removed ${result.files} old statement files`);
    },
  },
  {
    // Only with outgoing email; each waiting import is mentioned once.
    name: "review reminders",
    every: 24 * HOUR,
    firstAfter: 10 * MINUTE,
    run: async () => {
      const result = await sendReviewReminders(db);
      if (result.emails)
        console.log(
          `[scheduler] reminded ${result.emails} people about ${result.imports} imports`,
        );
    },
  },
  {
    name: "exchange rates",
    every: 12 * HOUR,
    firstAfter: 3 * MINUTE,
    run: () => refreshExchangeRates(db),
  },
  {
    // Not a live feed: an hourly price keeps net worth close to the market without hammering it.
    name: "security prices",
    every: HOUR,
    firstAfter: 4 * MINUTE,
    run: () => refreshQuotes(db),
  },
  {
    // After rates and prices have refreshed; a later run the same day replaces that day's figure.
    name: "net worth history",
    every: 6 * HOUR,
    firstAfter: 6 * MINUTE,
    run: () => recordAllNetWorth(db),
  },
];

const state = globalThis as unknown as { __finfolioScheduler?: boolean };

/**
 * In-process timers for housekeeping. Finfolio runs as one Node process, so there is no need for
 * a separate worker; every task is idempotent and safe to skip if the process restarts.
 */
export function startScheduler() {
  if (state.__finfolioScheduler) return;
  state.__finfolioScheduler = true;
  for (const task of tasks) {
    let running = false;
    const run = async () => {
      if (running) return;
      running = true;
      try {
        await task.run();
      } catch (error) {
        console.error(`[scheduler] ${task.name} failed`, error);
      } finally {
        running = false;
      }
    };
    setTimeout(() => {
      void run();
      setInterval(() => void run(), task.every).unref();
    }, task.firstAfter).unref();
  }
}
