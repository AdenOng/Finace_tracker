import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";
import { z } from "zod";

import { SpendingView } from "~/components/spending/spending-view";
import { currentMonth } from "~/lib/dates";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.spending.meta.spending };
}

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
      <SpendingView
        initialMonth={currentMonth()}
        initialAccountId={z.uuid().safeParse(account).success ? account! : null}
      />
    </HydrateClient>
  );
}
