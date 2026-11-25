"use client";

import { integer } from "./data-number-format";
import { useT, useLocale } from "~/i18n/client";
import { RefreshCw } from "lucide-react";
import { Button } from "~/components/ui/button";
import { FlashNotice } from "~/components/ui/flash-notice";
import { Checkbox } from "~/components/ui/field";
import { Section, Tag } from "~/components/ui/panel";
import { Table, Td, Th, Tr } from "~/components/ui/table";
import { useFlash } from "~/components/ui/use-flash";
import { cn } from "~/lib/cn";
import { formatDate, formatRelative } from "~/lib/format";
import { api } from "~/trpc/react";

export function MarketAdmin() {
  const locale = useLocale();
  const t = useT();
  const utils = api.useUtils();
  const [market] = api.admin.data.market.useSuspenseQuery();
  const { flash, success, error, clear } = useFlash(10_000);
  const refresh = api.admin.data.refreshRates.useMutation({
    onMutate: clear,
    onSuccess: async (r) => {
      if (r.failed.length)
        error(t.adminManage.data.ratesFetchFailed(r.failed.join(", ")));
      else
        success(
          r.stored
            ? t.adminManage.data.ratesStored(r.stored, r.currencies.join(", "))
            : t.adminManage.data.ratesCurrent(r.currencies.join(", ")),
        );
      await Promise.all([
        utils.admin.data.market.invalidate(),
        utils.admin.overview.attention.invalidate(),
      ]);
    },
    onError: error,
  });
  const prices = useFlash(15_000);
  const refreshPrices = api.admin.data.refreshPrices.useMutation({
    onMutate: prices.clear,
    onSuccess: async (r) => {
      const problems = [
        r.failed.length &&
          t.adminManage.data.noPriceFoundFor(r.failed.join(", ")),
        r.mismatched.length &&
          t.adminManage.data.quoteCurrencyMismatch(r.mismatched.join(", ")),
      ].filter(Boolean);
      const updated = t.adminManage.data.pricesUpdated(r.updated, r.checked);
      if (problems.length)
        prices.error(t.adminManage.data.skipped(updated, problems.join("; ")));
      else prices.success(updated);
      await utils.admin.data.market.invalidate();
    },
    onError: prices.error,
  });
  const setPriceQuotes = api.admin.data.setPriceQuotes.useMutation({
    onSuccess: () => utils.admin.data.market.invalidate(),
    onError: prices.error,
  });
  const today = new Date().toISOString().slice(0, 10);
  const staleBefore = new Date(Date.now() - 4 * 86_400_000)
    .toISOString()
    .slice(0, 10);

  return (
    <div className="space-y-6">
      <Section
        title={t.adminManage.data.exchangeRates}
        description={t.adminManage.data.referenceRatesHelp(market.fxSource)}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={refresh.isPending}
            onClick={() => refresh.mutate()}
          >
            <RefreshCw className="size-3.5" />
            {t.adminManage.data.refreshNow}
          </Button>
        }
      >
        <FlashNotice flash={flash} onDismiss={clear} className="mb-4" />
        {market.fx.length === 0 ? (
          <p className="text-ink-3 text-sm">
            {t.adminManage.data.noDisplayCurrenciesYet}
          </p>
        ) : (
          <Table>
            <thead>
              <tr>
                <Th>{t.adminManage.data.displayCurrency}</Th>
                <Th>{t.adminManage.data.latestRate}</Th>
                <Th className="text-right">{t.adminManage.data.storedRates}</Th>
              </tr>
            </thead>
            <tbody>
              {market.fx.map((f) => (
                <Tr key={f.currency}>
                  <Td className="font-semibold">{f.currency}</Td>
                  <Td>
                    {f.latest ? (
                      <span
                        className={cn(
                          f.latest < staleBefore && "text-warn font-semibold",
                        )}
                      >
                        {f.latest === today
                          ? t.adminManage.data.today
                          : formatDate(f.latest, locale)}
                      </span>
                    ) : (
                      <Tag tone="warn">{t.adminManage.data.noneStored}</Tag>
                    )}
                  </Td>
                  <Td className="figures text-right">
                    {integer.format(f.pairs)}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
        <p className="text-ink-3 mt-3 text-[13px]">
          {t.adminManage.data.currenciesInUse(
            market.accountCurrencies.join(", "),
          )}
        </p>
      </Section>

      <Section
        title={t.adminManage.data.securityPrices}
        description={t.adminManage.data.marketPricesHelp}
        actions={
          <Button
            variant="secondary"
            size="sm"
            loading={refreshPrices.isPending}
            disabled={!market.priceQuotes}
            onClick={() => refreshPrices.mutate()}
          >
            <RefreshCw className="size-3.5" />
            {t.adminManage.data.refreshNow}
          </Button>
        }
      >
        <Checkbox
          className="mb-5"
          label={t.adminManage.data.fetchMarketPrices}
          description={t.adminManage.data.marketPrivacyHelp}
          checked={market.priceQuotes}
          disabled={setPriceQuotes.isPending}
          onChange={(e) => setPriceQuotes.mutate({ enabled: e.target.checked })}
        />
        <FlashNotice flash={prices.flash} onDismiss={prices.clear} className="mb-4" />
        <dl className="mb-5 grid grid-cols-2 gap-6 sm:grid-cols-4">
          {[
            [
              t.adminManage.data.securities,
              integer.format(market.quotes.securities),
            ],
            [
              t.adminManage.data.withAQuote,
              integer.format(market.quotes.quoted),
            ],
            [
              t.adminManage.data.newestQuote,
              market.quotes.newest
                ? formatRelative(market.quotes.newest, undefined, locale)
                : "—",
            ],
            [
              t.adminManage.data.dailyClosesUpTo,
              market.priceHistoryLatest
                ? formatDate(market.priceHistoryLatest, locale)
                : "—",
            ],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="text-ink-2 text-[13px] font-semibold">{label}</dt>
              {/* "Newest quote" is relative to now, which moves between render and hydration. */}
              <dd
                className="figures font-display text-xl font-semibold"
                suppressHydrationWarning
              >
                {value}
              </dd>
            </div>
          ))}
        </dl>
        {market.unquoted.length ? (
          <>
            <h3 className="mb-2 text-sm font-semibold">
              {t.adminManage.data.statementValuations(market.unquoted.length)}
            </h3>
            <ul className="flex flex-wrap gap-1.5">
              {market.unquoted.map((s) => (
                <li key={s.id}>
                  <Tag tone="outline" className="h-6 px-2.5 text-[12px]">
                    {s.symbol}
                    {s.exchange ? (
                      <span className="text-ink-3 ml-1">{s.exchange}</span>
                    ) : null}
                  </Tag>
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </Section>
    </div>
  );
}
