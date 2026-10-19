/** Hero figure: symbol and minor units set back so the whole number leads. */
export function HeroFigure({
  value,
  muted,
}: {
  value: string;
  muted: boolean;
}) {
  const match = /^([−+]?)(\D*?)([\d,]+)(\.\d+)?$/.exec(value);
  if (!match) return <>{value}</>;
  const [, sign, symbol, whole, fraction] = match;
  return (
    <>
      <span className="text-ink-3 mr-2 align-[0.5em] text-[0.36em]">
        {sign}
        {symbol}
      </span>
      <span className={muted ? "text-ink-3" : undefined}>{whole}</span>
      {fraction ? (
        <span className="text-ink-3 text-[0.5em]">{fraction}</span>
      ) : null}
    </>
  );
}
