import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { SystemAdmin } from "~/components/admin/system-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "System" };

export default async function AdminSystemPage() {
  await requireAdminSession();
  void api.admin.system.info.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="System"
        description="Version, database, storage and configuration of this Finfolio."
      />
      <SystemAdmin />
    </HydrateClient>
  );
}
