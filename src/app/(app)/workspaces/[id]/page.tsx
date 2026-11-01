import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";
import { notFound } from "next/navigation";
import { z } from "zod";
import { WorkspaceDetail } from "~/components/workspaces/workspace-detail";
import { currentMonth } from "~/lib/dates";
import { api } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.workspaces.meta.sharedWorkspace };
}
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireEnrolledSession();
  const { id } = await params;
  if (!z.uuid().safeParse(id).success) notFound();
  const workspace = await api.workspaces
    .get({ workspaceId: id })
    .catch(() => null);
  if (!workspace) notFound();
  return (
    <WorkspaceDetail
      key={id}
      initialWorkspace={workspace}
      initialMonth={currentMonth()}
    />
  );
}
