import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { DataTabs } from "~/components/admin/admin-tabs";
import { StorageAdmin } from "~/components/admin/data-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Storage" };

export default async function AdminStoragePage() {
  await requireAdminSession();
  void api.admin.data.storage.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Data"
        description="Backups, the market data behind valuations, stored statement files and default data packs."
      />
      <DataTabs />
      <StorageAdmin />
    </HydrateClient>
  );
}
