import { getT } from "~/i18n/server";
import type { Metadata } from "next";

import { UsersAdmin } from "~/components/admin/users-admin";
import { PageHeader } from "~/components/ui/panel";
import { requireAdminSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.users.meta };
}

export default async function AdminUsersPage() {
  const t = await getT();
  const session = await requireAdminSession();
  void api.admin.users.list.prefetch();
  void api.admin.users.invitations.prefetch();
  void api.admin.security.settings.prefetch();

  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.users.title}
        description={t.adminManage.pages.users.description}
      />
      <UsersAdmin currentUserId={session.user.id} />
    </HydrateClient>
  );
}
