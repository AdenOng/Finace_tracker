import { getT } from "~/i18n/server";
import type { Metadata } from "next";

import { SecurityAdmin } from "~/components/admin/security-admin";
import { PageHeader } from "~/components/ui/panel";
import { requireAdminSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.security.meta };
}

export default async function AdminSecurityPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.security.settings.prefetch();
  void api.admin.security.summary.prefetch();

  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.security.title}
        description={t.adminManage.pages.security.description}
      />
      <SecurityAdmin />
    </HydrateClient>
  );
}
