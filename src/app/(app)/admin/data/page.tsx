import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { DataTabs } from "~/components/admin/admin-tabs";
import { BackupsAdmin } from "~/components/admin/data-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Backups" };

export default async function AdminBackupsPage() {
  await requireAdminSession();
  void api.admin.data.backups.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Data"
        description="Backups, the market data behind valuations, stored statement files and default data packs."
      />
      <DataTabs />
      <BackupsAdmin />
    </HydrateClient>
  );
}
