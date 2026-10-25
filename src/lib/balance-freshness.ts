import { todayIso } from "~/lib/dates";

/** Monthly statements can arrive 35–45 days apart; warn only beyond 45 calendar days. */
export const STALE_BALANCE_DAYS = 45;

export function isBalanceStale(asOf: string, today = todayIso()) {
  return (
    (Date.parse(today) - Date.parse(asOf)) / 86_400_000 > STALE_BALANCE_DAYS
  );
}
