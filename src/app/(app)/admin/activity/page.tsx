import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireAdminSession } from "~/server/auth";

import { AuditLog } from "~/components/admin/audit-log";
import { PageHeader } from "~/components/ui/panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.admin.activityPage.activityLog };
}

export default async function AdminActivityPage() {
  const t = await getT();
  await requireAdminSession();
  return (
    <>
      <PageHeader
        title={t.admin.activityPage.activityLog}
        description={
          t.admin.activityPage
            .everyAdminChangeAndPasswordResetNewestFirstEntriesCannotBeEditedOrDeletedFromTheApp
        }
      />
      <AuditLog />
    </>
  );
}
