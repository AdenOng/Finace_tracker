import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { DataTabs } from "~/components/admin/admin-tabs";
import { BackupsAdmin } from "~/components/admin/backups-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.data.meta };
}

export default async function AdminBackupsPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.data.backups.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.data.title}
        description={t.adminManage.pages.data.description}
      />
      <DataTabs />
      <BackupsAdmin />
    </HydrateClient>
  );
}
