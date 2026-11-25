import type { Metadata } from "next";
import { z } from "zod";

import { ConsolidatedPortfolio } from "~/components/portfolio/consolidated-portfolio";
import { getT } from "~/i18n/server";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.portfolio.meta.title };
}

export default async function PortfolioPage({
  searchParams,
}: {
  searchParams: Promise<{ broker?: string; q?: string }>;
}) {
  await requireEnrolledSession();
  const { broker, q } = await searchParams;
  const brokerId = z.uuid().safeParse(broker).success ? broker! : "";
  void api.portfolio.consolidated.prefetch(
    brokerId ? { accountId: brokerId } : undefined,
  );
  return (
    <HydrateClient>
      <ConsolidatedPortfolio
        initialBrokerId={brokerId}
        initialSearch={typeof q === "string" ? q.slice(0, 100) : ""}
      />
    </HydrateClient>
  );
}
