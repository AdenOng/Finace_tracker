/** Calendar helpers in the browser's local time zone. */

/** Today as YYYY-MM-DD. */
export function todayIso() {
  return new Date().toLocaleDateString("en-CA");
}

/** The current month as YYYY-MM. */
export function currentMonth() {
  return todayIso().slice(0, 7);
}

/** "2026-01", -1 → "2025-12" */
export function shiftMonth(month: string, delta: number) {
  const [year, m] = month.split("-").map(Number) as [number, number];
  const index = year * 12 + (m - 1) + delta;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}
