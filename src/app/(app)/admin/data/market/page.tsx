import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { DataTabs } from "~/components/admin/admin-tabs";
import { MarketAdmin } from "~/components/admin/data-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.dataMarket.meta };
}

export default async function AdminMarketPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.data.market.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.dataMarket.title}
        description={t.adminManage.pages.dataMarket.description}
      />
      <DataTabs />
      <MarketAdmin />
    </HydrateClient>
  );
}
