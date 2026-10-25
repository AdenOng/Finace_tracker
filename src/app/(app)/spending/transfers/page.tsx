import type { Metadata } from "next";

import { TransferReview } from "~/components/spending/transfer-review";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Transfers" };

export default async function TransfersPage() {
  await requireEnrolledSession();
  void api.transfers.list.prefetch();
  return (
    <HydrateClient>
      <TransferReview />
    </HydrateClient>
  );
}
