import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";
import { WorkspacesView } from "~/components/workspaces/workspaces-view";
import { PageHeader } from "~/components/ui/panel";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.workspaces.meta.workspaces };
}
export default async function WorkspacesPage() {
  await requireEnrolledSession();
  const t = await getT();
  return (
    <>
      <PageHeader
        title={t.workspaces.meta.workspaces}
        description={t.workspaces.page.description}
      />
      <WorkspacesView />
    </>
  );
}
