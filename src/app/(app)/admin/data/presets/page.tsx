import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { DataTabs } from "~/components/admin/admin-tabs";
import { PresetsAdmin } from "~/components/admin/data-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Data packs" };

export default async function AdminPresetsPage() {
  await requireAdminSession();
  void api.admin.data.presets.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Data"
        description="Backups, the market data behind valuations, stored statement files and default data packs."
      />
      <DataTabs />
      <PresetsAdmin />
    </HydrateClient>
  );
}
