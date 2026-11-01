import { getT } from "~/i18n/server";
import type { Metadata } from "next";

import { TransferReview } from "~/components/spending/transfer-review";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.spending.meta.transfers };
}

export default async function TransfersPage() {
  await requireEnrolledSession();
  void api.transfers.list.prefetch();
  return (
    <HydrateClient>
      <TransferReview />
    </HydrateClient>
  );
}
