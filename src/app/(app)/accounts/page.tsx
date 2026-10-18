import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";

import { AccountsView } from "~/components/accounts/accounts-view";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage() {
  await requireEnrolledSession();
  void api.accounts.list.prefetch();
  void api.catalog.institutions.prefetch();
  void api.catalog.currencies.prefetch();
  void api.settings.get.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Accounts"
        description="Bank, card, brokerage and wallet accounts. Each keeps its own currency; totals are converted on the overview."
      />
      <AccountsView />
    </HydrateClient>
  );
}
