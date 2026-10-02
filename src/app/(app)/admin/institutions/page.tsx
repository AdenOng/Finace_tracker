import type { Metadata } from "next";

import { InstitutionsAdmin } from "~/components/admin/institutions-admin";
import { PageHeader } from "~/components/ui/panel";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Brokers & banks" };

export default async function AdminInstitutionsPage() {
  void api.admin.institutions.list.prefetch();
  return (
    <HydrateClient>
      <PageHeader
        title="Brokers & banks"
        description="The institutions people can choose when they add an account. Removing one that is in use archives it instead, so history is kept."
      />
      <InstitutionsAdmin />
    </HydrateClient>
  );
}
