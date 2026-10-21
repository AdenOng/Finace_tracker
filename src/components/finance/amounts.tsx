import { cn } from "~/lib/cn";
import { formatMoney } from "~/lib/format";

/** One line per currency; amounts are never added across currencies without a rate. */
export function Amounts({
  totals,
  empty = "—",
  className,
}: {
  totals: { amount: string; currency: string }[];
  empty?: string;
  className?: string;
}) {
  if (totals.length === 0) {
    return <span className={cn("text-ink-3", className)}>{empty}</span>;
  }
  return (
    <span className={cn("figures inline-flex flex-col", className)}>
      {totals.map((t) => (
        <span key={t.currency}>
          <span className="sensitive">{formatMoney(t.amount, t.currency)}</span>
        </span>
      ))}
    </span>
  );
}
