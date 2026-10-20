import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { AdminOverview } from "~/components/admin/admin-overview";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Admin status" };

export default async function AdminIndex() {
  await requireAdminSession();
  void api.admin.overview.stats.prefetch();
  void api.admin.overview.attention.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Status"
        description="Who is using Finfolio, how imports are going and what needs attention."
      />
      <AdminOverview />
    </HydrateClient>
  );
}
