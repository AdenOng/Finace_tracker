import type { Metadata } from "next";

import { ImportsView } from "~/components/imports/imports-view";
import { PageHeader } from "~/components/ui/panel";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Imports" };

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  await requireEnrolledSession();
  const { account } = await searchParams;
  void api.accounts.list.prefetch();
  void api.imports.list.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Imports"
        description="Upload a bank, card or brokerage statement, or a screenshot. It's read for you, and nothing is saved until you've checked it."
      />
      <ImportsView initialAccountId={account ?? null} />
    </HydrateClient>
  );
}
