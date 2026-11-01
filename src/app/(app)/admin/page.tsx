import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { AdminOverview } from "~/components/admin/admin-overview";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.admin.statusPage.adminStatus };
}

export default async function AdminIndex() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.overview.stats.prefetch();
  void api.admin.overview.attention.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.common.fields.status}
        description={
          t.admin.statusPage
            .whoIsUsingFinfolioHowImportsAreGoingAndWhatNeedsAttention
        }
      />
      <AdminOverview />
    </HydrateClient>
  );
}
