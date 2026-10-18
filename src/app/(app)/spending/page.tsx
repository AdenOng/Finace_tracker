import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";
import { z } from "zod";

import { SpendingView } from "~/components/spending/spending-view";
import { PageHeader } from "~/components/ui/panel";
import { currentMonth } from "~/lib/dates";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Spending" };

export default async function SpendingPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  await requireEnrolledSession();
  const { account } = await searchParams;
  void api.accounts.list.prefetch();
  void api.catalog.categories.prefetch();
  void api.catalog.currencies.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Spending"
        description="Money in and out of your bank, card and cash accounts, month by month."
      />
      <SpendingView
        initialMonth={currentMonth()}
        initialAccountId={z.uuid().safeParse(account).success ? account! : null}
      />
    </HydrateClient>
  );
}
