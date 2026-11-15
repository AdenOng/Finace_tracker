/** Labels and groupings shared with the web app (see src/lib/accounts.ts). */
export const accountTypeLabels: Record<string, string> = {
  brokerage: "Brokerage",
  retirement: "Retirement",
  crypto_wallet: "Crypto wallet",
  checking: "Current / checking",
  savings: "Savings",
  credit_card: "Credit card",
  cash: "Cash",
  other: "Other",
  cpf: "CPF",
  srs: "SRS",
};
export const assetClassLabels: Record<string, string> = {
  stock: "Stock",
  etf: "ETF",
  fund: "Fund",
  bond: "Bond",
  option: "Option",
  crypto: "Crypto",
  other: "Other",
  cash: "Cash",
};
export type AccountGroup = "investments" | "banking" | "cpf_srs";
export const groupLabels: Record<AccountGroup, string> = {
  investments: "Investments",
  banking: "Bank & cards",
  cpf_srs: "CPF & SRS",
};
export function accountGroupOf(type: string): AccountGroup {
  if (type === "cpf" || type === "srs") return "cpf_srs";
  return ["brokerage", "retirement", "crypto_wallet"].includes(type)
    ? "investments"
    : "banking";
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
const LONG_MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];
/** "2 Nov 2026" from an ISO date, without time-zone shifts. */
export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  if (!y || !m || !d) return iso;
  return `${d} ${MONTHS[m - 1]} ${y}`;
}
/** "November 2026" from "2026-11". */
export function formatMonth(month: string) {
  const [y, m] = month.split("-").map(Number);
  return `${LONG_MONTHS[(m ?? 1) - 1]} ${y}`;
}
export const STALE_BALANCE_DAYS = 45;
export function isStale(iso: string | null | undefined, now = new Date()) {
  if (!iso) return false;
  const then = Date.parse(iso.slice(0, 10) + "T00:00:00Z");
  return now.getTime() - then > STALE_BALANCE_DAYS * 86_400_000;
}
export function initials(name: string) {
  const words = name
    .replace(/[^\p{L}\p{N} ]/gu, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  return (
    (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)) ||
    "?"
  ).toUpperCase();
}
