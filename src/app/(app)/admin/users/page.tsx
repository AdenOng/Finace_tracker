import type { Metadata } from "next";

import { UsersAdmin } from "~/components/admin/users-admin";
import { PageHeader } from "~/components/ui/panel";
import { requireAdminSession } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Users" };

export default async function AdminUsersPage() {
  const session = await requireAdminSession();
  void api.admin.users.list.prefetch();
  void api.admin.users.invitations.prefetch();

  return (
    <HydrateClient>
      <PageHeader
        title="Users"
        description="Invite family and friends. Each person's accounts and spending stay private to them."
      />
      <UsersAdmin currentUserId={session.user.id} />
    </HydrateClient>
  );
}
