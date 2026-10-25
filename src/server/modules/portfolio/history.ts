import Decimal from "decimal.js";
import {
  and,
  asc,
  eq,
  gte,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";

import {
  type AccountGroup,
  accountGroupOf,
  accountGroups,
} from "~/lib/accounts";
import { todayIso } from "~/lib/dates";
import type { Database } from "~/server/db";
import {
  accountSnapshot,
  cashBalance,
  financialAccount,
  networthSnapshot,
  position,
  priceHistory,
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
  plausibleQuote,
  statementUnitPrice,
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

/** How many months before someone's first entry the chart is backfilled from market closes. */
export const BACKFILL_MONTHS = 12;

/** The first day the chart is backfilled from, for someone whose first entry is on `first`. */
export function backfillFrom(first: string) {
  const d = new Date(`${first}T00:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() - BACKFILL_MONTHS);
  return d.toISOString().slice(0, 10);
}

/**
 * Closes the chart can use; needs `security` joined. Coin closes stored before the currency was
 * kept may be in USD rather than the holding's currency, so those are skipped (and refetched).
 */
export const usableClose = () =>
  or(isNotNull(priceHistory.currency), ne(security.assetClass, "crypto"));

const daysBefore = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) - days * 86_400_000)
    .toISOString()
    .slice(0, 10);

type HeldPosition = {
  securityId: string;
  currency: string;
  quantity: string;
  statementPrice: string | null;
  statementValue: string | null;
};

type Entry = {
  accountId: string;
  group: AccountGroup;
  asOf: string;
  positions: HeldPosition[];
  cash: Amount[];
};

export type Close = { date: string; close: string; currency: string };

/** One account group's amounts on a day, per currency. */
type Tally = { amounts: Amount[]; unpriced: number; backfilled: boolean };

/**
 * What the accounts added up to on each entry date and each market day in between, from a year
 * before the first entry. Each account counts its latest entry on or before the day, with
 * holdings at that day's close; before an account's first entry, its first entry is assumed to
 * have been held all along (`backfilled`). Without a usable close, a holding keeps its statement
 * value. Amounts are kept per account group, so each group can be drawn on its own. `entries`
 * must be oldest first; a later entry on the same date replaces an earlier one, as it does for
 * the current holdings. `closes` must be oldest first per security.
 */
export function estimatedTimeline(
  entries: Entry[],
  closes: ReadonlyMap<string, Close[]> = new Map(),
) {
  if (entries.length === 0) return [];
  const from = backfillFrom(entries[0]!.asOf);
  const firstOf = new Map<string, Entry>();
  for (const entry of entries) {
    const first = firstOf.get(entry.accountId);
    if (!first || first.asOf === entry.asOf)
      firstOf.set(entry.accountId, entry);
  }
  const dates = [
    ...new Set([
      ...entries.map((e) => e.asOf),
      ...[...closes.values()].flatMap((list) =>
        list.flatMap((c) => (c.date >= from ? [c.date] : [])),
      ),
    ]),
  ].sort();

  const current = new Map<string, Entry>();
  const seen = new Map<string, number>();
  /** The latest close on or before `date`; dates only move forward. */
  const closeOn = (securityId: string, date: string) => {
    const list = closes.get(securityId);
    if (!list) return null;
    let i = seen.get(securityId) ?? -1;
    while (i + 1 < list.length && list[i + 1]!.date <= date) i++;
    seen.set(securityId, i);
    return list[i] ?? null;
  };

  let next = 0;
  return dates.map((date) => {
    for (; next < entries.length && entries[next]!.asOf <= date; next++)
      current.set(entries[next]!.accountId, entries[next]!);
    const groups: Partial<Record<AccountGroup, Tally>> = {};
    for (const [accountId, first] of firstOf) {
      const entry = current.get(accountId) ?? first;
      const held = entry.asOf <= date;
      const tally = (groups[entry.group] ??= {
        amounts: [],
        unpriced: 0,
        backfilled: false,
      });
      if (!held) tally.backfilled = true;
      for (const p of entry.positions) {
        const close = closeOn(p.securityId, date);
        // A close older than the entry is staler than the statement, and one far from the
        // statement price is probably a different instrument. Prices in different currencies,
        // such as a coin's USD close for a holding recorded in JPY, cannot be compared.
        const usable =
          close &&
          close.date >= (held ? entry.asOf : daysBefore(date, 7)) &&
          (close.currency !== p.currency ||
            plausibleQuote(close.close, statementUnitPrice(p)));
        const value = valuePosition({
          ...p,
          quote: usable
            ? { price: close.close, currency: close.currency }
            : null,
        });
        if (value) tally.amounts.push(value);
        else tally.unpriced++;
      }
      tally.amounts.push(...entry.cash);
    }
    for (const tally of Object.values(groups))
      tally.amounts = sumByCurrency(tally.amounts);
    return { date, groups };
  });
}

/**
 * Personal net worth over time in the display currency. Days the app recorded come from
 * `networth_snapshot`; before the first of those, the curve is estimated from account entries
 * and past market closes (see `estimatedTimeline`), backfilled before each account's first
 * entry. Everything is converted at the latest exchange rates, so a change of
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

  // CPF and SRS are always drawn on their own, even when not counted in the total.
  const accounts = await db
    .select({ id: financialAccount.id, type: financialAccount.type })
    .from(financialAccount)
    .where(
      and(
        eq(financialAccount.ownerId, userId),
        isNull(financialAccount.archivedAt),
      ),
    );
  const groupOf = new Map(accounts.map((a) => [a.id, accountGroupOf(a.type)]));
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
            // Entries on the first recorded day still backfill the days before it.
            firstRecorded
              ? lte(accountSnapshot.asOf, firstRecorded)
              : undefined,
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
            securityId: position.securityId,
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

  const securityIds = [...new Set(positions.map((p) => p.securityId))];
  const closeRows = securityIds.length
    ? await db
        .select({
          securityId: priceHistory.securityId,
          date: priceHistory.date,
          close: priceHistory.close,
          currency: sql<string>`coalesce(${priceHistory.currency}, ${security.currency})`,
        })
        .from(priceHistory)
        .innerJoin(security, eq(security.id, priceHistory.securityId))
        .where(
          and(
            inArray(priceHistory.securityId, securityIds),
            gte(priceHistory.date, backfillFrom(snapshots[0]!.asOf)),
            firstRecorded ? lt(priceHistory.date, firstRecorded) : undefined,
            usableClose(),
          ),
        )
        .orderBy(asc(priceHistory.date))
    : [];
  const closes = new Map<string, Close[]>();
  for (const { securityId, ...close } of closeRows)
    closes.set(securityId, [...(closes.get(securityId) ?? []), close]);

  const timeline = estimatedTimeline(
    snapshots.map((snapshot) => ({
      accountId: snapshot.accountId,
      group: groupOf.get(snapshot.accountId)!,
      asOf: snapshot.asOf,
      positions: positions.filter((p) => p.snapshotId === snapshot.id),
      cash: cash.filter((c) => c.snapshotId === snapshot.id),
    })),
    closes,
  );

  const { rates } = await ratesInto(db, target, [
    ...timeline.flatMap((p) =>
      Object.values(p.groups).flatMap((t) => t.amounts.map((a) => a.currency)),
    ),
    ...recorded.map((r) => r.currency),
  ]);
  type Point = {
    date: string;
    total: string;
    partial: boolean;
    estimated: boolean;
    backfilled: boolean;
  };
  /** The estimate for some groups on a day, or null when none of it could be converted. */
  const estimate = (date: string, tallies: Tally[]): Point | null => {
    const { total, unconverted } = convertAmounts(
      tallies.flatMap((t) => t.amounts),
      target,
      rates,
    );
    return total === null
      ? null
      : {
          date,
          total,
          partial:
            unconverted.length > 0 || tallies.some((t) => t.unpriced > 0),
          estimated: true,
          backfilled: tallies.some((t) => t.backfilled),
        };
  };
  const recordedPoint = (
    row: (typeof recorded)[number],
    amount: string | null | undefined,
    partial: boolean,
  ): Point | null => {
    if (amount === null || amount === undefined) return null;
    const { total } = convertAmounts(
      [{ amount, currency: row.currency }],
      target,
      rates,
    );
    return total === null
      ? null
      : { date: row.date, total, partial, estimated: false, backfilled: false };
  };
  const estimatedDays = timeline.filter(
    (p) => !firstRecorded || p.date < firstRecorded,
  );

  const estimated = estimatedDays.flatMap((point) => {
    const counted = Object.entries(point.groups).flatMap(([group, tally]) =>
      countCpfSrs || group !== "cpf_srs" ? [tally] : [],
    );
    return estimate(point.date, counted) ?? [];
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
    return recordedPoint(row, amount.toFixed(), partial) ?? [];
  });

  // Each group on its own: estimated days from its accounts, recorded days from the breakdown.
  // Recorded days only say whether the whole figure was partial, which then applies to each part.
  const groups = Object.fromEntries(
    (Object.keys(accountGroups) as AccountGroup[]).map((group) => [
      group,
      [
        ...estimatedDays.flatMap((point) => {
          const tally = point.groups[group];
          return (tally && estimate(point.date, [tally])) ?? [];
        }),
        ...recorded.flatMap((row) => {
          const b = row.breakdown as Partial<NetWorthBreakdown>;
          const overall = b.partial ?? false;
          return (
            (group === "investments"
              ? recordedPoint(row, b.investments, overall)
              : group === "banking"
                ? recordedPoint(row, b.banking, overall)
                : recordedPoint(
                    row,
                    b.cpfSrs,
                    // Excluded CPF/SRS amounts were not part of the overall flag.
                    b.cpfSrsPartial ?? (b.cpfSrsCounted === false || overall),
                  )) ?? []
          );
        }),
      ],
    ]),
  ) as Record<AccountGroup, Point[]>;
  return { currency: target, points: [...estimated, ...days], groups };
}
