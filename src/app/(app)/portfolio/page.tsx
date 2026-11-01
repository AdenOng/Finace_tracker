import { getT } from "~/i18n/server";
import type { Metadata } from "next";

import { ConsolidatedPortfolio } from "~/components/portfolio/consolidated-portfolio";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.portfolio.meta.title };
}

export default async function PortfolioPage() {
  await requireEnrolledSession();
  void api.portfolio.consolidated.prefetch();
  return (
    <HydrateClient>
      <ConsolidatedPortfolio />
    </HydrateClient>
  );
}
