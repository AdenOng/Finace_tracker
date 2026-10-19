import type { Metadata } from "next";

import { ConsolidatedPortfolio } from "~/components/portfolio/consolidated-portfolio";
import { requireEnrolledSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Consolidated portfolio" };

export default async function PortfolioPage() {
  await requireEnrolledSession();
  void api.portfolio.consolidated.prefetch();
  return (
    <HydrateClient>
      <ConsolidatedPortfolio />
    </HydrateClient>
  );
}
