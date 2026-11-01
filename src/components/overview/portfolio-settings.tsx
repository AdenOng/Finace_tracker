"use client";
import { useT } from "~/i18n/client";

import { Settings } from "lucide-react";
import { Suspense, useState } from "react";

import { CountCpfSrs } from "~/components/settings/count-cpf-srs";
import { CurrencySelect } from "~/components/settings/currency-select";
import { Button } from "~/components/ui/button";
import { Drawer } from "~/components/ui/dialog";

export function PortfolioSettings({
  currency,
  id,
  iconOnly = false,
}: {
  currency: string;
  id: string;
  iconOnly?: boolean;
}) {
  const t = useT();

  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className={iconOnly ? "min-h-11 min-w-9 px-2.5" : "min-h-11 px-2.5"}
        aria-label={
          iconOnly
            ? t.overview.portfolioSettings.investmentDisplaySettings
            : t.overview.portfolioSettings.netWorthDisplaySettings
        }
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
      >
        {!iconOnly ? <span className="font-mono">{currency}</span> : null}
        <Settings aria-hidden="true" className="size-4" />
      </Button>
      <Drawer
        open={open}
        confirmDiscard={false}
        onClose={() => setOpen(false)}
        title={t.overview.portfolioSettings.portfolioDisplay}
        description={
          t.overview.portfolioSettings
            .chooseOneCurrencyForYourNetWorthInvestments
        }
        footer={
          <Button onClick={() => setOpen(false)}>
            {t.common.actions.done}
          </Button>
        }
      >
        <label
          htmlFor={id}
          className="text-ink-2 mb-2 block text-sm font-medium"
        >
          {t.overview.portfolioSettings.displayCurrency}
        </label>
        <Suspense
          fallback={
            <p className="text-ink-3 text-sm">
              {t.overview.portfolioSettings.loadingCurrencies}
            </p>
          }
        >
          <CurrencySelect id={id} />
        </Suspense>
        <p className="text-ink-3 mt-4 text-sm">
          {
            t.overview.portfolioSettings
              .eachAccountTotalIncludesItsInvestmentsAndCash
          }
        </p>
        <p className="text-ink-3 mt-3 text-sm">
          {
            t.overview.portfolioSettings
              .exchangeRatesRefreshAutomaticallyIfARateIs
          }
        </p>
        <Suspense fallback={null}>
          <CountCpfSrs />
        </Suspense>
      </Drawer>
    </>
  );
}
