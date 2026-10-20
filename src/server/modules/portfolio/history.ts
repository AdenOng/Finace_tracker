import Decimal from "decimal.js";
import { and, asc, eq, inArray, isNull, lt } from "drizzle-orm";

import { accountGroupOf } from "~/lib/accounts";
import { todayIso } from "~/lib/dates";
import type { Database } from "~/server/db";
import {
  accountSnapshot,
  cashBalance,
  financialAccount,
  networthSnapshot,
  position,
  security,
  userSettings,
} from "~/server/db/schema";
import { resolveAccessScope } from "~/server/lib/access";
import { preset } from "~/server/lib/preset";
import { hasSnapshotEntries, ratesInto } from "./holdings";
import { computeNetWorth } from "./net-worth";
import {
  type Amount,
  convertAmounts,
  sumByCurrency,
  valuePosition,
} from "./valuation";

export type NetWorthBreakdown = {
  investments: string | null;
  banking: string | null;
  cpfSrs: string | null;
  cpfSrsCounted: boolean;
  /** Needed when CPF/SRS were excluded at recording time but are included when reading. */
  cpfSrsPartial?: boolean;
  /** Some amounts had no exchange rate or holdings no price, so `total` is too low. */
  partial: boolean;
  /** Account id → total in the snapshot's currency. */
  accounts: Record<string, string>;
};

/**
 * Saves one person's personal net worth for `date`, exactly as the overview shows it. Running
 * again the same day replaces that day's figure, so the last run of a day is what stays.
 */
export async function recordNetWorth(
  db: Database,
  userId: string,
  date = todayIso(),
) {
  const scope = resolveAccessScope(userId);
  const worth = await computeNetWorth(db, scope, scope);
  if (worth.total === null || !worth.accounts.some((a) => a.asOf)) return false;
  const investments = worth.allocation.flatMap((a) =>
    a.total ? [a.total] : [],
  );
  const breakdown: NetWorthBreakdown = {
    investments: investments.length
      ? investments.reduce((sum, v) => sum.plus(v), new Decimal(0)).toFixed()
      : null,
    banking: worth.banking.total,
    cpfSrs: worth.cpfSrs.total,
    cpfSrsCounted: worth.countCpfSrs,
    cpfSrsPartial: worth.accounts.some(
      (a) =>
        accountGroupOf(a.type) === "cpf_srs" &&
        (a.unpriced > 0 || a.unconverted.length > 0),
    ),
    partial: worth.unconverted.length > 0 || worth.unpriced > 0,
    accounts: Object.fromEntries(
      worth.accounts.flatMap((a) => (a.total ? [[a.id, a.total]] : [])),
    ),
  };
  const values = {
    ownerId: userId,
    date,
    currency: worth.currency,
    total: worth.total,
    breakdown,
  };
  await db
    .insert(networthSnapshot)
    .values(values)
    .onConflictDoUpdate({
      target: [networthSnapshot.ownerId, networthSnapshot.date],
      set: { currency: values.currency, total: values.total, breakdown },
    });
  return true;
}

/** Today's figure for everyone who has recorded an account entry. One failure skips one person. */
export async function recordAllNetWorth(db: Database) {
  const owners = await db
    .selectDistinct({ ownerId: accountSnapshot.ownerId })
    .from(accountSnapshot);
  let recorded = 0;
  for (const { ownerId } of owners) {
    try {
      if (await recordNetWorth(db, ownerId)) recorded++;
    } catch (error) {
      console.error("[net worth] could not record a snapshot", error);
    }
  }
  return recorded;
}

type Entry = {
  accountId: string;
  asOf: string;
  totals: Amount[];
  unpriced: number;
};

/**
 * What the accounts added up to on each date an entry was made: every account's latest entry on
 * or before that date, summed per currency. `entries` must be oldest first; a later entry on the
 * same date replaces an earlier one, as it does for the current holdings.
 */
export function entryTimeline(entries: Entry[]) {
  const current = new Map<string, Entry>();
  const points: { date: string; amounts: Amount[]; unpriced: number }[] = [];
  for (const entry of entries) {
    current.set(entry.accountId, entry);
    const held = [...current.values()];
    const point = {
      date: entry.asOf,
      amounts: sumByCurrency(held.flatMap((e) => e.totals)),
      unpriced: held.reduce((n, e) => n + e.unpriced, 0),
    };
    if (points.at(-1)?.date === entry.asOf) points[points.length - 1] = point;
    else points.push(point);
  }
  return points;
}

/**
 * Personal net worth over time in the display currency. Days the app recorded come from
 * `networth_snapshot`; before the first of those, the curve is estimated from account entries at
 * their statement values. Everything is converted at the latest exchange rates, so a change of
 * display currency keeps the history.
 */
export async function netWorthHistory(db: Database, userId: string) {
  const [settings] = await db
    .select({
      currency: userSettings.displayCurrency,
      countCpfSrs: userSettings.countCpfSrs,
    })
    .from(userSettings)
    .where(eq(userSettings.userId, userId))
    .limit(1);
  const target = settings?.currency ?? "SGD";
  const { cpfSrs: cpfSrsEnabled } = await preset.features();
  const countCpfSrs = !cpfSrsEnabled || (settings?.countCpfSrs ?? true);

  const recorded = await db
    .select({
      date: networthSnapshot.date,
      currency: networthSnapshot.currency,
      total: networthSnapshot.total,
      breakdown: networthSnapshot.breakdown,
    })
    .from(networthSnapshot)
    .where(eq(networthSnapshot.ownerId, userId))
    .orderBy(asc(networthSnapshot.date));
  const firstRecorded = recorded[0]?.date;

  const accounts = (
    await db
      .select({ id: financialAccount.id, type: financialAccount.type })
      .from(financialAccount)
      .where(
        and(
          eq(financialAccount.ownerId, userId),
          isNull(financialAccount.archivedAt),
        ),
      )
  ).filter((a) => countCpfSrs || accountGroupOf(a.type) !== "cpf_srs");
  const snapshots = accounts.length
    ? await db
        .select({
          id: accountSnapshot.id,
          accountId: accountSnapshot.accountId,
          asOf: accountSnapshot.asOf,
        })
        .from(accountSnapshot)
        .where(
          and(
            eq(accountSnapshot.ownerId, userId),
            inArray(
              accountSnapshot.accountId,
              accounts.map((a) => a.id),
            ),
            hasSnapshotEntries(db),
            firstRecorded ? lt(accountSnapshot.asOf, firstRecorded) : undefined,
          ),
        )
        .orderBy(
          asc(accountSnapshot.asOf),
          asc(accountSnapshot.createdAt),
          asc(accountSnapshot.id),
        )
    : [];
  const ids = snapshots.map((s) => s.id);
  const [positions, cash] = ids.length
    ? await Promise.all([
        db
          .select({
            snapshotId: position.snapshotId,
            currency: security.currency,
            quantity: position.quantity,
            statementPrice: position.statementPrice,
            statementValue: position.statementValue,
          })
          .from(position)
          .innerJoin(security, eq(security.id, position.securityId))
          .where(inArray(position.snapshotId, ids)),
        db
          .select({
            snapshotId: cashBalance.snapshotId,
            currency: cashBalance.currency,
            amount: cashBalance.amount,
          })
          .from(cashBalance)
          .where(inArray(cashBalance.snapshotId, ids)),
      ])
    : [[], []];

  // Each entry at its own recorded values: that is what the account held on its date.
  const timeline = entryTimeline(
    snapshots.map((snapshot) => {
      const values = positions
        .filter((p) => p.snapshotId === snapshot.id)
        .map((p) => valuePosition({ ...p, quote: null }));
      return {
        accountId: snapshot.accountId,
        asOf: snapshot.asOf,
        totals: [
          ...values.flatMap((v) => (v ? [v] : [])),
          ...cash.filter((c) => c.snapshotId === snapshot.id),
        ],
        unpriced: values.filter((v) => !v).length,
      };
    }),
  );

  const { rates } = await ratesInto(db, target, [
    ...timeline.flatMap((p) => p.amounts.map((a) => a.currency)),
    ...recorded.map((r) => r.currency),
  ]);
  const estimated = timeline.flatMap((point) => {
    const { total, unconverted } = convertAmounts(point.amounts, target, rates);
    return total === null
      ? []
      : [
          {
            date: point.date,
            total,
            partial: unconverted.length > 0 || point.unpriced > 0,
            estimated: true,
          },
        ];
  });
  const days = recorded.flatMap((row) => {
    const breakdown = row.breakdown as Partial<NetWorthBreakdown>;
    let amount = new Decimal(row.total);
    let partial = breakdown.partial ?? false;
    if (
      typeof breakdown.cpfSrsCounted === "boolean" &&
      breakdown.cpfSrsCounted !== countCpfSrs
    ) {
      const cpfSrs = breakdown.cpfSrs ?? "0";
      amount = countCpfSrs ? amount.plus(cpfSrs) : amount.minus(cpfSrs);
      // Older snapshots did not track whether excluded CPF/SRS amounts were complete.
      if (countCpfSrs) partial ||= breakdown.cpfSrsPartial ?? true;
    }
    const { total } = convertAmounts(
      [{ amount: amount.toFixed(), currency: row.currency }],
      target,
      rates,
    );
    return total === null
      ? []
      : [
          {
            date: row.date,
            total,
            partial,
            estimated: false,
          },
        ];
  });
  return { currency: target, points: [...estimated, ...days] };
}
