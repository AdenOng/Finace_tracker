import type { Metadata } from "next";

import { AuditLog } from "~/components/admin/audit-log";
import { PageHeader } from "~/components/ui/panel";

export const metadata: Metadata = { title: "Activity log" };

export default function AdminActivityPage() {
  return (
    <>
      <PageHeader
        title="Activity log"
        description="Every admin change and password reset, newest first. Entries cannot be edited or deleted from the app."
      />
      <AuditLog />
    </>
  );
}
