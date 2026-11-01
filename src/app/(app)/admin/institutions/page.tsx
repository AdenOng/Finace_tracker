import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { InstitutionsAdmin } from "~/components/admin/institutions-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.institutions.meta };
}

export default async function AdminInstitutionsPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.institutions.list.prefetch();
  void api.admin.institutions.defaultsPreview.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.institutions.title}
        description={t.adminManage.pages.institutions.description}
      />
      <InstitutionsAdmin />
    </HydrateClient>
  );
}
