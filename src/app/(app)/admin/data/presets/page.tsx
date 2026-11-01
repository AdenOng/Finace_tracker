import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { DataTabs } from "~/components/admin/admin-tabs";
import { PresetsAdmin } from "~/components/admin/data-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.dataPresets.meta };
}

export default async function AdminPresetsPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.data.presets.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.dataPresets.title}
        description={t.adminManage.pages.dataPresets.description}
      />
      <DataTabs />
      <PresetsAdmin />
    </HydrateClient>
  );
}
