import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { SystemAdmin } from "~/components/admin/system-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.system.meta };
}

export default async function AdminSystemPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.system.info.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.system.title}
        description={t.adminManage.pages.system.description}
      />
      <SystemAdmin />
    </HydrateClient>
  );
}
