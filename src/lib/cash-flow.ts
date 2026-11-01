import DecimalJs from "decimal.js";

const Decimal = DecimalJs.clone({ precision: 40 });

export const cashFlowAccountTypes = ["checking", "savings", "cash"] as const;
export const isCashFlowAccount = (type: string) =>
  cashFlowAccountTypes.some((t) => t === type);

export function addDays(date: string, days: number) {
  return new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000)
    .toISOString()
    .slice(0, 10);
}

export type ScheduleDates = {
  startDate: string;
  endDate: string | null;
  frequency: "weekly" | "monthly" | "yearly";
};

/** Always anchor to the original day: Jan 31 → Feb 28 → Mar 31; leap days also recover. */
export function occurrenceDates(
  schedule: ScheduleDates,
  from: string,
  through: string,
) {
  const start = new Date(`${schedule.startDate}T00:00:00Z`);
  const lower = new Date(`${from}T00:00:00Z`);
  const upper = Math.min(
    Date.parse(`${through}T00:00:00Z`),
    schedule.endDate ? Date.parse(`${schedule.endDate}T00:00:00Z`) : Infinity,
  );
  let index =
    schedule.frequency === "weekly"
      ? Math.max(
          0,
          Math.floor((lower.getTime() - start.getTime()) / (7 * 86_400_000)),
        )
      : schedule.frequency === "monthly"
        ? Math.max(
            0,
            (lower.getUTCFullYear() - start.getUTCFullYear()) * 12 +
              lower.getUTCMonth() -
              start.getUTCMonth(),
          )
        : Math.max(0, lower.getUTCFullYear() - start.getUTCFullYear());
  const dates: string[] = [];
  for (; ; index++) {
    let candidate: Date;
    if (schedule.frequency === "weekly")
      candidate = new Date(start.getTime() + index * 7 * 86_400_000);
    else {
      const month =
        start.getUTCMonth() +
        (schedule.frequency === "monthly" ? index : index * 12);
      const first = new Date(0);
      first.setUTCFullYear(start.getUTCFullYear(), month, 1);
      const last = new Date(first);
      last.setUTCMonth(first.getUTCMonth() + 1, 0);
      const lastDay = last.getUTCDate();
      first.setUTCDate(Math.min(start.getUTCDate(), lastDay));
      candidate = first;
    }
    if (!Number.isFinite(candidate.getTime()) || candidate.getTime() > upper)
      break;
    const date = candidate.toISOString().slice(0, 10);
    if (date >= from) dates.push(date);
  }
  return dates;
}

export type PlanningTransaction = {
  id: string;
  accountId: string;
  postedDate: string;
  amount: string;
  currency: string;
  description: string;
  isTransfer: boolean;
};

export function matchesOccurrence(
  schedule: { accountId: string; amount: string; currency: string },
  dueDate: string,
  transaction: PlanningTransaction,
) {
  return (
    !transaction.isTransfer &&
    transaction.accountId === schedule.accountId &&
    transaction.currency === schedule.currency &&
    new Decimal(transaction.amount).eq(schedule.amount) &&
    transaction.postedDate >= addDays(dueDate, -7) &&
    transaction.postedDate <= addDays(dueDate, 7)
  );
}

export type CardPayment = {
  id: string;
  bankAccountId: string;
  cardAccountId: string;
  date: string;
  amount: string;
  currency: string;
};

export function statementPaymentStatus(
  bill: {
    bankAccountId: string;
    cardAccountId: string;
    statementDate: string;
    dueDate: string;
    amountDue: string;
    currency: string;
  },
  payments: CardPayment[],
  today: string,
) {
  const eligible = payments
    .filter(
      (p) =>
        p.bankAccountId === bill.bankAccountId &&
        p.cardAccountId === bill.cardAccountId &&
        p.currency === bill.currency &&
        p.date > bill.statementDate &&
        p.date <= today &&
        new Decimal(p.amount).gt(0),
    )
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  let paid = new Decimal(0);
  let paidOn: string | null = null;
  const applied: CardPayment[] = [];
  for (const payment of eligible) {
    if (paid.gte(bill.amountDue)) break;
    applied.push(payment);
    paid = paid.plus(payment.amount);
    if (!paidOn && paid.gte(bill.amountDue)) paidOn = payment.date;
  }
  const remaining = Decimal.max(0, new Decimal(bill.amountDue).minus(paid));
  const status: "paid" | "unpaid" | "partial" | "overdue" = remaining.isZero()
    ? "paid"
    : bill.dueDate < today
      ? "overdue"
      : paid.gt(0)
        ? "partial"
        : "unpaid";
  return {
    paid: Decimal.min(paid, bill.amountDue).toFixed(),
    remaining: remaining.toFixed(),
    status,
    paidOn,
    paidLate: paidOn !== null && paidOn > bill.dueDate,
    payments: applied,
  };
}

export type ForecastEvent = { date: string; amount: string; name: string };

export function forecastBalance(
  opening: string | null,
  events: ForecastEvent[],
  today: string,
  days: number,
) {
  let balance = opening === null ? null : new Decimal(opening);
  return Array.from({ length: days + 1 }, (_, i) => {
    const date = addDays(today, i);
    const due = events.filter(
      (e) => (e.date < today ? today : e.date) === date,
    );
    const change = due.reduce(
      (sum, event) => sum.plus(event.amount),
      new Decimal(0),
    );
    if (balance !== null) balance = balance.plus(change);
    return {
      date,
      change: change.toFixed(),
      balance: balance?.toFixed() ?? null,
    };
  });
}
