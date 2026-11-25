import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { DataTabs } from "~/components/admin/admin-tabs";
import { StorageAdmin } from "~/components/admin/storage-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.dataStorage.meta };
}

export default async function AdminStoragePage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.data.storage.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.dataStorage.title}
        description={t.adminManage.pages.dataStorage.description}
      />
      <DataTabs />
      <StorageAdmin />
    </HydrateClient>
  );
}
