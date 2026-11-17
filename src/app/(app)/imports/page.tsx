import { getT } from "~/i18n/server";
import type { Metadata } from "next";

import { ImportsView } from "~/components/imports/imports-view";
import { PageHeader } from "~/components/ui/panel";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.imports.page.imports };
}

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const t = await getT();
  await requireEnrolledSession();
  const { account } = await searchParams;
  void api.accounts.list.prefetch();
  void api.imports.list.prefetchInfinite({});
  return (
    <HydrateClient>
      <PageHeader
        title={t.imports.page.imports}
        description={t.imports.page.uploadABankCardOr}
      />
      <ImportsView initialAccountId={account ?? null} />
    </HydrateClient>
  );
}
