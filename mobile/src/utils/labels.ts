import {
  accountGroups,
  accountTypeLabels as accountTypes,
  assetClassLabels as assetClasses,
  type AccountGroup,
} from "../../../src/lib/accounts";

export { accountGroupOf, type AccountGroup } from "../../../src/lib/accounts";

export const accountTypeLabels: Record<string, string> = accountTypes;
export const assetClassLabels: Record<string, string> = assetClasses;

export const groupLabels: Record<AccountGroup, string> = {
  investments: accountGroups.investments.label,
  banking: accountGroups.banking.label,
  cpf_srs: accountGroups.cpf_srs.label,
};

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
    (words.length > 1 ? words[0]![0]! + words[1]![0]! : name.slice(0, 2)) || "?"
  ).toUpperCase();
}
