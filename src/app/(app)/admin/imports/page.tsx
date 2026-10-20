import type { Metadata } from "next";

import { ImportJobsAdmin } from "~/components/admin/import-jobs-admin";
import { PageHeader } from "~/components/ui/panel";
import { requireAdminSession } from "~/server/auth";
import { isEmailConfigured } from "~/server/lib/mailer";
import { api, HydrateClient } from "~/trpc/server";

export const metadata: Metadata = { title: "Import jobs" };

export default async function AdminImportsPage() {
  await requireAdminSession();
  void api.admin.jobs.counts.prefetch();

  return (
    <HydrateClient>
      <PageHeader
        title="Import jobs"
        description="Every statement read across the instance: retry failures, stop stuck reads and nudge people with statements waiting for review."
      />
      <ImportJobsAdmin emailConfigured={isEmailConfigured()} />
    </HydrateClient>
  );
}
