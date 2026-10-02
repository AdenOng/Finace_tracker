import { and, eq, isNull } from "drizzle-orm";
import { Check, Minus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";

import { CurrencySelect } from "~/components/settings/currency-select";
import { EmptyState, Section } from "~/components/ui/panel";
import { cn } from "~/lib/cn";
import { formatMoney } from "~/lib/format";
import { isAdmin, requireSession } from "~/server/auth";
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
  const session = await requireSession();
  const settings = await api.settings.get();
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

  return (
    <HydrateClient>
      <div className="mb-14 grid gap-8 md:grid-cols-[1fr_auto] md:items-end">
        <div>
          <p className="text-ink-2 text-[15px] font-semibold">
            Net worth for {firstName}
          </p>
          <p className="figures font-wide text-ink-3 mt-3 text-6xl leading-none font-extrabold sm:text-7xl">
            {formatMoney(0, settings.displayCurrency)}
          </p>
          <p className="text-ink-2 mt-4 max-w-md text-sm">
            Nothing to total yet. Once accounts are linked or statements
            imported, holdings are valued at live prices and converted to your
            display currency.
          </p>
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
        >
          <EmptyState title="No accounts yet">
            Account linking (IBKR Flex, Longbridge OpenAPI) and statement
            imports are the next build step. The broker list and categories they
            will use can already be managed in the admin console.
          </EmptyState>
        </Section>

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
            <ChecklistItem done={false}>Add your first account</ChecklistItem>
          </ul>
        </Section>
      </div>
    </HydrateClient>
  );
}
