import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";

import { AccountsView } from "~/components/accounts/accounts-view";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Accounts" };

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string }>;
}) {
  await requireEnrolledSession();
  const { add } = await searchParams;
  void api.accounts.list.prefetch();
  void api.catalog.institutions.prefetch();
  void api.catalog.currencies.prefetch();
  void api.settings.get.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Accounts"
        description="Investments are valued from what they hold; bank and card accounts from their balance and transactions. Each keeps its own currency."
      />
      <AccountsView
        initialAdd={
          add === "investments" || add === "banking" || add === "cpf_srs"
            ? add
            : null
        }
      />
    </HydrateClient>
  );
}
