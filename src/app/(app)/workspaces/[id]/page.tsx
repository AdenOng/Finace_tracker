import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { WorkspaceDetail } from "~/components/workspaces/workspace-detail";
import { currentMonth } from "~/lib/dates";
import { api } from "~/trpc/server";

export const metadata: Metadata = { title: "Shared workspace" };
export default async function WorkspacePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
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
