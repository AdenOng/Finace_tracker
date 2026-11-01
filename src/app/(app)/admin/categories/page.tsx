import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { CategoriesAdmin } from "~/components/admin/categories-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.categories.meta };
}

export default async function AdminCategoriesPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.categories.list.prefetch();
  void api.admin.categories.defaultsPreview.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.categories.title}
        description={t.adminManage.pages.categories.description}
      />
      <CategoriesAdmin />
    </HydrateClient>
  );
}
