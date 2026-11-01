import { getT } from "~/i18n/server";
import type { Metadata } from "next";

import { ImportJobsAdmin } from "~/components/admin/import-jobs-admin";
import { PageHeader } from "~/components/ui/panel";
import { requireAdminSession } from "~/server/auth";
import { isEmailConfigured } from "~/server/lib/mailer";
import { api, HydrateClient } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.adminManage.pages.imports.meta };
}

export default async function AdminImportsPage() {
  const t = await getT();
  await requireAdminSession();
  void api.admin.jobs.counts.prefetch();

  return (
    <HydrateClient>
      <PageHeader
        title={t.adminManage.pages.imports.title}
        description={t.adminManage.pages.imports.description}
      />
      <ImportJobsAdmin emailConfigured={isEmailConfigured()} />
    </HydrateClient>
  );
}
