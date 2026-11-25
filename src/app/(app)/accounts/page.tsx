import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";

import { AccountsView } from "~/components/accounts/accounts-view";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.accounts.meta.title };
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: Promise<{ add?: string; tab?: string }>;
}) {
  const t = await getT();
  await requireEnrolledSession();
  const { add, tab } = await searchParams;
  void api.accounts.list.prefetch();
  void api.catalog.institutions.prefetch();
  void api.catalog.currencies.prefetch();
  void api.settings.get.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.accounts.meta.title}
        description={t.accounts.meta.description}
      />
      <AccountsView
        initialTab={tab === "archived" ? "archived" : "open"}
        initialAdd={
          add === "investments" || add === "banking" || add === "cpf_srs"
            ? add
            : null
        }
      />
    </HydrateClient>
  );
}
