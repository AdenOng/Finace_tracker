import Link from "next/link";
import { AmountsScope } from "~/components/finance/privacy";
import { AccountRow } from "~/components/overview/account-row";
import { Allocation } from "~/components/overview/allocation";
import { PortfolioSettings } from "~/components/overview/portfolio-settings";
import { SheetHeader } from "~/components/overview/sheet-header";
import { formatMoney } from "~/lib/format";
import type { CommonMessages } from "~/i18n/messages";
import type { rollupOverviewHoldings } from "~/server/modules/portfolio/overview";

const link =
  "font-semibold underline decoration-current/30 underline-offset-4 hover:decoration-current";

export function InvestmentsCard({
  holdings,
  currency,
  t,
}: {
  holdings: ReturnType<typeof rollupOverviewHoldings>;
  currency: string;
  t: CommonMessages;
}) {
  const { investing, investTotal, investmentIncomplete, slices } = holdings;
  return (
    <AmountsScope
      scope="overview-investments"
      id="investments"
      className="card min-w-0 scroll-mt-6 p-5 sm:p-8"
    >
      <SheetHeader
        eyebrow={t.common.accountGroups.investments}
        title={formatMoney(investTotal.toFixed(2), currency)}
        href="/portfolio"
        linkLabel={t.overview.page.portfolio}
        settings={
          <PortfolioSettings
            currency={currency}
            id="investments-currency"
            iconOnly
          />
        }
      />
      {investmentIncomplete ? (
        <p className="text-warn mt-4 text-sm">
          {t.overview.page.partialInvestmentTotalAllocationWillAppearWhenEvery}
        </p>
      ) : null}
      {!investmentIncomplete && slices.length > 0 ? (
        <div className="mt-6">
          <Allocation slices={slices} />
        </div>
      ) : null}
      {investing.length === 0 ? (
        <p className="text-ink-2 mt-6 text-sm">
          {t.overview.page.brokerageRetirementAndCryptoAccountsAreValuedFrom}{" "}
          <Link href="/accounts?add=investments" className={link}>
            {t.overview.page.addOne}
          </Link>
          {t.overview.sentenceEnd}
        </p>
      ) : (
        <ul className="mt-6">
          {investing.map((a) => (
            <AccountRow key={a.id} account={a} currency={currency} />
          ))}
        </ul>
      )}
    </AmountsScope>
  );
}
