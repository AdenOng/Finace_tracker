import { assetClassLabels } from "~/lib/accounts";

type AssetClassKey = keyof typeof assetClassLabels;

/**
 * Fixed fill per asset class, checked for colour-blind separation on paper. The four inks carry
 * the securities; crypto is solid ink and cash a hatch, so no two classes rely on hue alone.
 */
const FILLS: Record<AssetClassKey, string> = {
  stock: "#2d4fa3",
  etf: "#0b8f84",
  fund: "#b07a10",
  bond: "#d0587f",
  crypto: "#2b261f",
  cash: "repeating-linear-gradient(135deg, #2b261f 0 1.5px, transparent 1.5px 5px)",
  option: "radial-gradient(#2b261f 1px, transparent 1.3px) 0 0 / 5px 5px",
  other: "radial-gradient(#2b261f 1px, transparent 1.3px) 0 0 / 5px 5px",
};
/** Bar order is fixed so a class always sits in the same place. */
const ORDER: AssetClassKey[] = [
  "stock",
  "etf",
  "fund",
  "bond",
  "crypto",
  "option",
  "other",
  "cash",
];

export type AllocationSlice = {
  assetClass: AssetClassKey;
  share: number;
  display: string;
};

/** Stacked bar of the portfolio by asset class, with a legend that carries the values. */
export function Allocation({ slices }: { slices: AllocationSlice[] }) {
  const inBarOrder = ORDER.flatMap((k) =>
    slices.filter((s) => s.assetClass === k),
  );
  const bySize = [...slices].sort((a, b) => b.share - a.share);
  return (
    <div>
      <div
        role="img"
        aria-label={bySize
          .map(
            (s) => `${assetClassLabels[s.assetClass]} ${s.share.toFixed(1)}%`,
          )
          .join(", ")}
        className="flex h-4 gap-[2px]"
      >
        {inBarOrder.map((s) => (
          <span
            key={s.assetClass}
            title={`${assetClassLabels[s.assetClass]} · ${s.share.toFixed(1)}%`}
            className="border-ink/25 min-w-[3px] border first:rounded-l-[4px] last:rounded-r-[4px]"
            style={{ width: `${s.share}%`, background: FILLS[s.assetClass] }}
          />
        ))}
      </div>
      <ul className="mt-4 grid gap-x-8 sm:grid-cols-2">
        {bySize.map((s) => (
          <li
            key={s.assetClass}
            className="border-line flex items-center gap-2.5 border-b py-2 text-[13px]"
          >
            <span
              className="border-ink/25 size-3 shrink-0 rounded-[3px] border"
              style={{ background: FILLS[s.assetClass] }}
            />
            <span className="flex-1">{assetClassLabels[s.assetClass]}</span>
            <span className="figures sensitive font-mono text-[12px]">
              {s.display}
            </span>
            <span className="figures text-ink-3 w-12 text-right font-mono text-[12px]">
              {s.share.toFixed(1)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
