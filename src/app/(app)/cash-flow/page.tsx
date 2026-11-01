import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { CashFlowView } from "~/components/planning/cash-flow-view";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.planning.meta.title };
}

export default async function CashFlowPage() {
  await requireEnrolledSession();
  void api.planning.overview.prefetch({ days: 30 });
  return (
    <HydrateClient>
      <CashFlowView />
    </HydrateClient>
  );
}
