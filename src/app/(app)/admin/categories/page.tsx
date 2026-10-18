import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { CategoriesAdmin } from "~/components/admin/categories-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  await requireAdminSession();
  void api.admin.categories.list.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Categories"
        description="The spending taxonomy shared by every user and the AI that reads statements."
      />
      <CategoriesAdmin />
    </HydrateClient>
  );
}
