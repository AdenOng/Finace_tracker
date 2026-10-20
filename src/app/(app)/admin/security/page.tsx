import type { Metadata } from "next";

import { SecurityAdmin } from "~/components/admin/security-admin";
import { PageHeader } from "~/components/ui/panel";
import { requireAdminSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Security" };

export default async function AdminSecurityPage() {
  await requireAdminSession();
  void api.admin.security.settings.prefetch();
  void api.admin.security.summary.prefetch();

  return (
    <HydrateClient>
      <PageHeader
        title="Security"
        description="Who must use two-step verification, how long sign-ins last, and every sign-in attempt."
      />
      <SecurityAdmin />
    </HydrateClient>
  );
}
