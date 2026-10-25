import Decimal from "decimal.js";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";

import {
  cpfBucketLabels,
  holdsSecurities,
  type AccountType,
} from "~/lib/accounts";
import {
  category,
  investmentTransaction,
  security,
  stagedRow,
  transaction,
} from "~/server/db/schema";
import type { AccessScope } from "~/server/lib/access";
import type { StatementExtraction } from "~/server/modules/extraction";
import type { FinanceDatabase } from "~/server/modules/spending/guards";
import {
  loadMerchantRules,
  matchMerchantRule,
  normalizeMerchantText,
} from "~/server/modules/spending/rules";
import {
  decimalString,
  optionalDecimal,
  stagedSchemas,
  type StagedKind,
} from "./rows";

type NewRow = {
  kind: StagedKind;
  data: Record<string, unknown>;
  matchStatus: "new" | "duplicate" | "possible_duplicate";
  matchedRecordId: string | null;
  decision: "accept" | "skip";
};

const shiftDays = (iso: string, days: number) =>
  new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);

function dateRange(dates: string[]) {
  const sorted = [...dates].sort();
  return { from: shiftDays(sorted[0]!, -3), to: shiftDays(sorted.at(-1)!, 3) };
}

/**
 * Turn a validated extraction into reviewable rows for one account. Bank and card accounts get
 * transactions (plus the closing balance, or CPF sub-account balances); investment accounts get
 * holdings, cash and activity.
 * Each line is compared with what the account already has: an exact match is a duplicate and
 * starts skipped, a same-day same-amount line is flagged but kept. Returns notes about anything
 * that could not be staged.
 */
export async function stageExtraction(
  tx: FinanceDatabase,
  scope: AccessScope,
  jobId: string,
  account: { id: string; type: AccountType; currency: string },
  out: StatementExtraction,
) {
  const rows: NewRow[] = [];
  const notes: string[] = [];
  const add = (
    kind: StagedKind,
    data: unknown,
    match: Partial<NewRow> = {},
  ) => {
    const parsed = stagedSchemas[kind].safeParse(data);
    if (!parsed.success) {
      notes.push(
        `Left out a ${kind.replace("_", " ")} that could not be read.`,
      );
      return;
    }
    rows.push({
      kind,
      data: parsed.data,
      matchStatus: "new",
      matchedRecordId: null,
      decision: "accept",
      ...match,
    });
  };
  // Each currency (and CPF sub-account) can only be saved once per dated entry.
  const seenCash = new Set<string>();
  const addCash = (balances: StatementExtraction["cashBalances"]) => {
    for (const c of balances) {
      const bucket = account.type === "cpf" ? c.bucket : null;
      const label = `${c.currency.toUpperCase()}${bucket ? ` ${cpfBucketLabels[bucket]}` : ""}`;
      if (seenCash.has(label)) {
        notes.push(`Left out a second ${label} balance.`);
        continue;
      }
      seenCash.add(label);
      add("cash_balance", {
        currency: c.currency,
        amount: decimalString(c.amount, 4),
        bucket,
      });
    }
  };

  if (holdsSecurities(account.type)) {
    for (const p of out.positions) {
      add("position", {
        symbol: p.symbol,
        exchange: p.exchange ?? "",
        name: p.name,
        assetClass: p.assetClass,
        currency: p.currency,
        quantity: decimalString(p.quantity, 10),
        averageCost: optionalDecimal(
          p.averageCost === null ? null : Math.abs(p.averageCost),
          8,
        ),
        price: optionalDecimal(
          p.marketPrice === null ? null : Math.abs(p.marketPrice),
          8,
        ),
        value: optionalDecimal(p.marketValue, 4),
      });
    }
    addCash(out.cashBalances);

    const activity = out.investmentTransactions;
    const existing =
      activity.length > 0
        ? await tx
            .select({
              id: investmentTransaction.id,
              tradeDate: investmentTransaction.tradeDate,
              type: investmentTransaction.type,
              amount: investmentTransaction.amount,
              currency: investmentTransaction.currency,
              symbol: sql<
                string | null
              >`coalesce(${security.symbol}, ${stagedRow.data}->>'symbol')`,
            })
            .from(investmentTransaction)
            .leftJoin(
              security,
              eq(security.id, investmentTransaction.securityId),
            )
            .leftJoin(
              stagedRow,
              and(
                eq(stagedRow.committedRecordId, investmentTransaction.id),
                eq(stagedRow.kind, "investment_transaction"),
              ),
            )
            .where(
              and(
                eq(investmentTransaction.accountId, account.id),
                gte(
                  investmentTransaction.tradeDate,
                  dateRange(activity.map((a) => a.tradeDate)).from,
                ),
                lte(
                  investmentTransaction.tradeDate,
                  dateRange(activity.map((a) => a.tradeDate)).to,
                ),
              ),
            )
        : [];
    const used = new Set<string>();
    for (const a of activity) {
      const amount = decimalString(a.amount, 4);
      const match = existing.find(
        (e) =>
          !used.has(e.id) &&
          e.tradeDate === a.tradeDate &&
          e.type === a.type &&
          e.currency === a.currency.toUpperCase() &&
          (e.symbol?.trim().toUpperCase() ?? null) ===
            (a.symbol?.trim().toUpperCase() ?? null) &&
          new Decimal(e.amount).equals(amount),
      );
      if (match) used.add(match.id);
      add(
        "investment_transaction",
        {
          tradeDate: a.tradeDate,
          settleDate: a.settleDate,
          type: a.type,
          symbol: a.symbol,
          quantity: optionalDecimal(a.quantity, 10),
          price: optionalDecimal(
            a.price === null ? null : Math.abs(a.price),
            8,
          ),
          amount,
          fees: optionalDecimal(a.fees, 4),
          currency: a.currency,
          description: a.description,
        },
        match
          ? {
              matchStatus: "duplicate",
              matchedRecordId: match.id,
              decision: "skip",
            }
          : {},
      );
    }
  } else {
    const keys = await tx
      .select({ id: category.id, key: category.key })
      .from(category)
      .where(isNull(category.archivedAt));
    const categoryOf = new Map(keys.map((k) => [k.key, k.id]));
    const rules = await loadMerchantRules(tx, scope);

    const lines = out.transactions.filter((t) => t.amount !== 0);
    const existing =
      lines.length > 0
        ? await tx
            .select({
              id: transaction.id,
              postedDate: transaction.postedDate,
              amount: transaction.amount,
              currency: transaction.currency,
              description: transaction.description,
            })
            .from(transaction)
            .where(
              and(
                eq(transaction.accountId, account.id),
                gte(
                  transaction.postedDate,
                  dateRange(lines.map((t) => t.postedDate ?? t.date)).from,
                ),
                lte(
                  transaction.postedDate,
                  dateRange(lines.map((t) => t.postedDate ?? t.date)).to,
                ),
              ),
            )
        : [];
    const used = new Set<string>();
    for (const t of lines) {
      const postedDate = t.postedDate ?? t.date;
      const amount = decimalString(t.amount, 4);
      const sameDay = existing.filter(
        (e) =>
          !used.has(e.id) &&
          e.currency === (t.currency || account.currency).toUpperCase() &&
          (e.postedDate === postedDate || e.postedDate === t.date) &&
          new Decimal(e.amount).equals(amount),
      );
      const exact = sameDay.find(
        (e) =>
          normalizeMerchantText(e.description) ===
          normalizeMerchantText(t.description),
      );
      const match = exact ?? sameDay[0];
      if (match) used.add(match.id);

      const categoryId =
        (t.categoryKey ? categoryOf.get(t.categoryKey) : undefined) ??
        (t.isTransfer ? undefined : matchMerchantRule(rules, t)?.categoryId) ??
        null;
      add(
        "transaction",
        {
          postedDate,
          transactionDate: t.date !== postedDate ? t.date : null,
          description: t.description,
          merchant: t.merchant,
          amount,
          currency: t.currency || account.currency,
          originalAmount: optionalDecimal(t.originalAmount, 4),
          originalCurrency: t.originalCurrency,
          categoryId,
          isTransfer: t.isTransfer,
        },
        match
          ? {
              matchStatus: exact ? "duplicate" : "possible_duplicate",
              matchedRecordId: match.id,
              decision: exact ? "skip" : "accept",
            }
          : {},
      );
    }

    // The statement's closing balance becomes the account balance on the last day it covers.
    // CPF balances are kept per sub-account when every one is labelled; a statement without a
    // closing total falls back to the balances it lists.
    const split =
      account.type === "cpf" &&
      out.cashBalances.length > 0 &&
      out.cashBalances.every((c) => c.bucket);
    addCash(
      !split && out.closingBalance !== null
        ? [
            {
              currency: out.currency || account.currency,
              amount: out.closingBalance,
              bucket: null,
            },
          ]
        : out.cashBalances,
    );
  }

  if (rows.length > 0) {
    // Rows keep the statement's order: each is stamped a millisecond after the one before.
    const start = Date.now();
    await tx.insert(stagedRow).values(
      rows.map((r, i) => ({
        ...r,
        jobId,
        ownerId: scope.userId,
        createdAt: new Date(start + i),
      })),
    );
  }
  return { count: rows.length, notes };
}
