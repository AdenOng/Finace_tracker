"use client";

import Link from "next/link";
import { useState } from "react";

import { useT, useLocale } from "~/i18n/client";
import { AmountsScope, AmountsToggle } from "~/components/finance/privacy";
import { Button } from "~/components/ui/button";
import { Input, Select } from "~/components/ui/field";
import { Notice } from "~/components/ui/panel";
import { formatDate, formatMoney } from "~/lib/format";
import { api, type RouterOutputs } from "~/trpc/react";

type Review = RouterOutputs["transfers"]["list"];
type Side = Review["unmatched"][number];
type Suggestion = Review["suggestions"][number];
const key = (side: Side) => `${side.kind}:${side.id}`;
const pairKey = (match: Suggestion) =>
  `${key(match.outgoing)}:${key(match.incoming)}`;

function SideLabel({ side }: { side: Side }) {
  const t = useT();
  const locale = useLocale();
  return (
    <span>
      <span className="font-semibold">{side.accountName}</span> ·{" "}
      {formatDate(side.date, locale)} ·{" "}
      <span className="sensitive">
        {formatMoney(side.amount, side.currency)}
      </span>{" "}
      {side.currency} ·{" "}
      {side.direction === "out"
        ? t.spending.transferReview.outgoing
        : t.spending.transferReview.incoming}
      <span className="text-ink-3 block text-sm">{side.description}</span>
    </span>
  );
}

export function TransferReview() {
  const t = useT();
  const locale = useLocale();
  const [data] = api.transfers.list.useSuspenseQuery();
  const utils = api.useUtils();
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [counterpart, setCounterpart] = useState("");
  const [feeAmount, setFeeAmount] = useState("");
  const [feeCurrency, setFeeCurrency] = useState("");
  const refresh = async () => {
    setChoosing(null);
    setError(null);
    await Promise.all([
      utils.transfers.invalidate(),
      utils.spending.list.invalidate(),
    ]);
  };
  const options = {
    onSuccess: refresh,
    onError: (e: { message: string }) => setError(e.message),
  };
  const link = api.transfers.link.useMutation(options);
  const unlink = api.transfers.unlink.useMutation(options);
  const exclude = api.transfers.noCounterpart.useMutation(options);
  const busy = link.isPending || unlink.isPending || exclude.isPending;
  const suggestions = data.suggestions.filter(
    (match) => !dismissed.includes(pairKey(match)),
  );
  const suggestedSides = new Set(
    suggestions.flatMap((match) => [key(match.outgoing), key(match.incoming)]),
  );
  const withoutMatch = data.unmatched.filter(
    (side) => !suggestedSides.has(key(side)),
  );
  const choose = (side: Side, match?: Suggestion) => {
    setChoosing(key(side));
    setCounterpart(match ? key(match.incoming) : "");
    setFeeAmount(match?.feeAmount ?? "");
    setFeeCurrency(match?.feeCurrency ?? side.currency);
  };
  const renderChooser = (side: Side) => {
    if (choosing !== key(side)) return null;
    const candidates = data.unmatched.filter(
      (s) => s.direction !== side.direction && s.accountId !== side.accountId,
    );
    const selected = candidates.find((s) => key(s) === counterpart);
    return (
      <div className="mt-3 space-y-3">
        <label className="block text-sm">
          {t.spending.transferReview.counterpart}
          <Select
            className="mt-1"
            value={counterpart}
            onChange={(e) => setCounterpart(e.target.value)}
          >
            <option value="">{t.spending.transferReview.chooseAnEntry}</option>
            {candidates.map((s) => (
              <option key={key(s)} value={key(s)}>
                {s.accountName} · {s.date} · {s.amount} {s.currency} ·{" "}
                {s.description}
              </option>
            ))}
          </Select>
        </label>
        <div className="flex flex-wrap gap-3">
          <label className="text-sm">
            {t.spending.transferReview.feeAmountOptional}
            <Input
              inputMode="decimal"
              value={feeAmount}
              onChange={(e) => setFeeAmount(e.target.value)}
            />
          </label>
          <label className="text-sm">
            {t.spending.transferReview.feeCurrency}
            <Input
              maxLength={3}
              value={feeCurrency}
              onChange={(e) => setFeeCurrency(e.target.value.toUpperCase())}
            />
          </label>
        </div>
        <p className="text-ink-3 text-xs">
          {t.spending.transferReview.useAFeePrintedSeparatelyOrAn}
        </p>
        <Button
          size="sm"
          disabled={busy || !selected}
          onClick={() => {
            if (selected)
              link.mutate({
                outgoing: side.direction === "out" ? side : selected,
                incoming: side.direction === "in" ? side : selected,
                manual: true,
                fee: feeAmount
                  ? { amount: feeAmount, currency: feeCurrency }
                  : null,
              });
          }}
        >
          {t.spending.transferReview.linkSelectedEntries}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setChoosing(null)}>
          {t.common.actions.cancel}
        </Button>
      </div>
    );
  };
  return (
    <>
      <Link href="/spending" className="text-sm underline underline-offset-4">
        {t.spending.transferReview.backToSpending}
      </Link>
      <header className="my-5 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-semibold">
            {t.spending.transferReview.transfers}
          </h1>
          <p className="text-ink-3 mt-1 text-sm">
            {
              t.spending.transferReview
                .matchExistingEntriesAcrossYourAccountsFees
            }
          </p>
        </div>
        <AmountsToggle />
      </header>
      {error ? <Notice tone="error">{error}</Notice> : null}
      <AmountsScope scope="spending-transactions">
        <h2 className="mb-3 text-lg font-semibold">
          {t.spending.transferReview.suggested(suggestions.length)}
        </h2>
        <p className="text-ink-3 mb-4 text-sm">
          {t.spending.transferReview.suggestionPolicy(
            data.fxAsOf ? formatDate(data.fxAsOf, locale) : null,
          )}
        </p>
        {suggestions.length === 0 ? (
          <p className="text-ink-3 mb-6">
            {t.spending.transferReview.noSuggestedMatches}
          </p>
        ) : null}
        <ul className="space-y-4">
          {suggestions.map((match) => (
            <li
              key={pairKey(match)}
              className="border-line rounded-xl border p-4"
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start">
                <div>
                  {t.spending.transferReview.from}{" "}
                  <SideLabel side={match.outgoing} />
                </div>
                <span aria-hidden="true">→</span>
                <div>
                  {t.spending.transferReview.toLabel}{" "}
                  <SideLabel side={match.incoming} />
                </div>
              </div>
              {match.feeAmount ? (
                <p className="mt-2 text-sm">
                  {t.spending.transferReview.impliedFee}{" "}
                  <span className="sensitive">
                    {formatMoney(match.feeAmount, match.feeCurrency!)}
                  </span>{" "}
                  {match.feeCurrency}
                </p>
              ) : null}
              {match.fxRate ? (
                <p className="mt-2 text-sm">
                  {t.spending.transferReview.fx(
                    match.outgoing.currency,
                    match.fxRate,
                    match.incoming.currency,
                  )}
                </p>
              ) : null}
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  disabled={busy}
                  onClick={() =>
                    link.mutate({
                      outgoing: match.outgoing,
                      incoming: match.incoming,
                    })
                  }
                >
                  {t.common.actions.confirm}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => choose(match.outgoing, match)}
                >
                  {t.spending.transferReview.chooseAnotherFee}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setDismissed((current) => [...current, pairKey(match)]);
                    setChoosing(null);
                  }}
                >
                  {t.spending.transferReview.notAPair}
                </Button>
              </div>
              {renderChooser(match.outgoing)}
            </li>
          ))}
        </ul>
        <h2 className="mt-8 mb-3 text-lg font-semibold">
          {t.spending.transferReview.unmatched(withoutMatch.length)}
        </h2>
        {withoutMatch.length === 0 ? (
          <p className="text-ink-3 mb-6">
            {t.spending.transferReview.noTransfersWithoutAMatch}
          </p>
        ) : null}
        <ul className="space-y-4">
          {withoutMatch.map((side) => (
            <li key={key(side)} className="border-line rounded-xl border p-4">
              <SideLabel side={side} />
              <p className="text-ink-3 my-3 text-sm">
                {
                  t.spending.transferReview
                    .noSuggestedCounterpartYetImportTheOther
                }
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={busy}
                  onClick={() => choose(side)}
                >
                  {t.spending.transferReview.chooseAnotherFee}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => exclude.mutate({ ...side, excluded: true })}
                >
                  {t.spending.transferReview.noCounterpartInFinfolio}
                </Button>
              </div>
              {renderChooser(side)}
            </li>
          ))}
        </ul>
        <h2 className="mt-8 mb-3 text-lg font-semibold">
          {t.spending.transferReview.linked(data.links.length)}
        </h2>
        <ul className="space-y-3">
          {data.links.map((item) => (
            <li key={item.id} className="border-line rounded-xl border p-4">
              {item.outgoing ? <SideLabel side={item.outgoing} /> : null}
              <p className="text-ink-3 my-1">{t.spending.transferReview.to}</p>
              {item.incoming ? <SideLabel side={item.incoming} /> : null}
              {item.feeAmount ? (
                <p className="mt-2 text-sm">
                  {t.spending.transferReview.fee}{" "}
                  <span className="sensitive">
                    {formatMoney(item.feeAmount, item.feeCurrency!)}
                  </span>{" "}
                  {item.feeCurrency}
                </p>
              ) : null}
              <Button
                className="mt-3"
                size="sm"
                variant="secondary"
                disabled={busy}
                onClick={() => unlink.mutate({ id: item.id })}
              >
                {t.spending.transferReview.unlink}
              </Button>
            </li>
          ))}
        </ul>
        {data.excluded.length ? (
          <details className="mt-8">
            <summary className="cursor-pointer text-sm font-semibold">
              {t.spending.transferReview.excluded(data.excluded.length)}
            </summary>
            <ul className="mt-3 space-y-3">
              {data.excluded.map((side) => (
                <li
                  key={key(side)}
                  className="border-line rounded-xl border p-4"
                >
                  <SideLabel side={side} />
                  <Button
                    className="mt-3"
                    size="sm"
                    variant="secondary"
                    disabled={busy}
                    onClick={() => exclude.mutate({ ...side, excluded: false })}
                  >
                    {t.spending.transferReview.reviewAgain}
                  </Button>
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </AmountsScope>
    </>
  );
}
