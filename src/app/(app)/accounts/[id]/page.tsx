import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";
import { notFound } from "next/navigation";
import { z } from "zod";

import { AccountDetail } from "~/components/accounts/account-detail";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Account" };

export default async function AccountPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireEnrolledSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  // Fetched here, not just prefetched, so a missing or foreign account is a 404 page.
  const account = await api.accounts.get({ id }).catch(() => null);
  if (!account) notFound();
  void api.catalog.institutions.prefetch();
  void api.catalog.currencies.prefetch();
  void api.settings.get.prefetch();
  return (
    <HydrateClient>
      <AccountDetail id={id} initialAccount={account} />
    </HydrateClient>
  );
}
