import { and, eq, isNull } from "drizzle-orm";
import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { Amounts } from "~/components/finance/amounts";
import { CurrencySelect } from "~/components/settings/currency-select";
import { EmptyState, Section } from "~/components/ui/panel";
import { Table, Td, Tr } from "~/components/ui/table";
import { accountTypeLabels, assetClassLabels } from "~/lib/accounts";
import { cn } from "~/lib/cn";
import { formatDate, formatMoney } from "~/lib/format";
import { isAdmin, requireEnrolledSession } from "~/server/auth";
import { db } from "~/server/db";
import { llmProvider } from "~/server/db/schema";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Overview" };

function ChecklistItem({
  done,
  children,
}: {
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <li className="border-line flex items-start gap-3 border-b py-3 text-sm last:border-b-0">
      <span
        className={cn(
          "mt-0.5 grid size-5 shrink-0 place-items-center",
          done ? "bg-forest text-mint" : "border-ink-3 text-ink-3 border",
        )}
      >
        {done ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : (
          <Minus className="size-3" />
        )}
      </span>
      <span className={done ? "text-ink-2" : "text-ink"}>{children}</span>
    </li>
  );
}

export default async function OverviewPage() {
  const session = await requireEnrolledSession();
  const [settings, worth] = await Promise.all([
    api.settings.get(),
    api.portfolio.netWorth(),
  ]);
  void api.catalog.currencies.prefetch();
  void api.settings.get.prefetch();

  const admin = isAdmin(session.user);
  const hasDefaultProvider = admin
    ? (await db.$count(
        llmProvider,
        and(isNull(llmProvider.ownerId), eq(llmProvider.isDefault, true)),
      )) > 0
    : true;
  const firstName = session.user.name.split(" ")[0];
  const recorded = worth.accounts.some((a) => a.asOf);

  return (
    <HydrateClient>
      <div className="mb-14 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-ink-2 text-[15px] font-semibold">
            Net worth for {firstName}
          </p>
          <p
            className={cn(
              "figures font-wide mt-3 text-6xl leading-none font-extrabold sm:text-7xl",
              !recorded && "text-ink-3",
            )}
          >
            {formatMoney(worth.total ?? 0, settings.displayCurrency)}
          </p>
          <div className="text-ink-2 mt-4 max-w-md space-y-1 text-sm">
            {!recorded ? (
              <p>
                Nothing to total yet. Add your accounts and record their
                balances and holdings; amounts are converted to your display
                currency.
              </p>
            ) : (
              <p>Latest balances, up to {formatDate(worth.asOf!)}.</p>
            )}
            {worth.unconverted.length > 0 ? (
              <p className="text-warn">
                Not included, no exchange rate to {worth.currency} yet:{" "}
                {worth.unconverted
                  .map((a) => formatMoney(a.amount, a.currency))
                  .join(", ")}
                .
              </p>
            ) : null}
            {worth.unpriced > 0 ? (
              <p className="text-warn">
                {worth.unpriced} holding{worth.unpriced === 1 ? "" : "s"}{" "}
                without a price {worth.unpriced === 1 ? "is" : "are"} not
                counted.
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <label
            htmlFor="overview-currency"
            className="text-[13px] font-semibold"
          >
            Show amounts in
          </label>
          <Suspense fallback={<div className="bg-wash h-10 w-44" />}>
            <CurrencySelect id="overview-currency" />
          </Suspense>
        </div>
      </div>

      <div className="grid gap-12 lg:grid-cols-[1.4fr_1fr]">
        <Section
          title="Accounts"
          description="Brokerage, bank and card accounts you track."
          actions={
            worth.accounts.length > 0 ? (
              <Link
                href="/accounts"
                className="text-sm font-semibold underline underline-offset-4"
              >
                Manage
              </Link>
            ) : undefined
          }
        >
          {worth.accounts.length === 0 ? (
            <EmptyState
              title="No accounts yet"
              action={
                <Link
                  href="/accounts"
                  className="font-semibold underline underline-offset-4"
                >
                  Add an account
                </Link>
              }
            >
              Add your bank, card and brokerage accounts, then record their
              balances. Statement imports and broker sync come in a later build
              step.
            </EmptyState>
          ) : (
            <Table>
              <tbody>
                {worth.accounts.map((a) => (
                  <Tr key={a.id}>
                    <Td>
                      <Link
                        href={`/accounts/${a.id}`}
                        className="font-semibold hover:underline hover:underline-offset-4"
                      >
                        {a.name}
                      </Link>
                      <span className="text-ink-3 block text-[13px]">
                        {accountTypeLabels[a.type]}
                        {a.asOf ? ` · ${formatDate(a.asOf)}` : ""}
                      </span>
                    </Td>
                    <Td className="text-right">
                      {!a.asOf ? (
                        <span className="text-ink-3">Not recorded</span>
                      ) : a.unpriced > 0 && a.totals.length === 0 ? (
                        <span className="text-warn">Awaiting prices</span>
                      ) : a.unconverted.length > 0 ? (
                        <Amounts totals={a.totals} className="text-warn" />
                      ) : (
                        <span className="figures font-semibold">
                          {formatMoney(a.total ?? 0, worth.currency)}
                        </span>
                      )}
                      {a.unpriced > 0 ? (
                        <span className="text-warn block text-[13px]">
                          {a.unpriced} holding{a.unpriced === 1 ? "" : "s"}{" "}
                          without a price
                        </span>
                      ) : null}
                    </Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <div className="space-y-12">
          {worth.allocation.length > 0 ? (
            <Section
              title="By asset class"
              description={`In ${worth.currency}.`}
            >
              <Table>
                <tbody>
                  {worth.allocation.map((a) => (
                    <Tr key={a.assetClass}>
                      <Td>{assetClassLabels[a.assetClass]}</Td>
                      <Td className="text-right">
                        {a.total ? (
                          <span className="figures font-semibold">
                            {formatMoney(a.total, worth.currency)}
                          </span>
                        ) : null}
                        {a.unconverted.length > 0 ? (
                          <Amounts
                            totals={a.unconverted}
                            className="text-warn block"
                          />
                        ) : null}
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </Section>
          ) : null}

          <Section title="Getting set up">
            <ul>
              <ChecklistItem done={!!session.user.twoFactorEnabled}>
                Turn on two-step sign-in in{" "}
                <Link
                  href="/settings"
                  className="font-semibold underline underline-offset-4"
                >
                  Settings
                </Link>
              </ChecklistItem>
              {admin ? (
                <ChecklistItem done={hasDefaultProvider}>
                  Default AI provider set —{" "}
                  <Link
                    href="/admin/ai"
                    className="font-semibold underline underline-offset-4"
                  >
                    run a test
                  </Link>{" "}
                  before importing
                </ChecklistItem>
              ) : null}
              <ChecklistItem done={worth.accounts.length > 0}>
                <Link
                  href="/accounts"
                  className="font-semibold underline underline-offset-4"
                >
                  Add your first account
                </Link>
              </ChecklistItem>
              <ChecklistItem done={recorded}>
                Record a balance or holdings
              </ChecklistItem>
            </ul>
          </Section>
        </div>
      </div>
    </HydrateClient>
  );
}
