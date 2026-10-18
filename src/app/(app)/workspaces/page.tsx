import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";
import { WorkspacesView } from "~/components/workspaces/workspaces-view";
import { PageHeader } from "~/components/ui/panel";

export const metadata: Metadata = { title: "Workspaces" };
export default async function WorkspacesPage() {
  await requireEnrolledSession();
  return (
    <>
      <PageHeader
        title="Workspaces"
        description="Shared views for family finances, funds, and other groups."
      />
      <WorkspacesView />
    </>
  );
}
