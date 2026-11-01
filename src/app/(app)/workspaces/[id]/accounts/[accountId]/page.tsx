import { getT } from "~/i18n/server";
import type { Metadata } from "next";
import { requireEnrolledSession } from "~/server/auth";
import { notFound } from "next/navigation";
import { z } from "zod";
import { AccountDetail } from "~/components/accounts/account-detail";
import { api } from "~/trpc/server";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.workspaces.meta.sharedAccount };
}
export default async function SharedAccountPage({
  params,
}: {
  params: Promise<{ id: string; accountId: string }>;
}) {
  await requireEnrolledSession();
  const { id: workspaceId, accountId: id } = await params;
  if (
    !z.uuid().safeParse(id).success ||
    !z.uuid().safeParse(workspaceId).success
  )
    notFound();
  const account = await api.accounts.get({ id, workspaceId }).catch(() => null);
  if (!account) notFound();
  return (
    <AccountDetail id={id} workspaceId={workspaceId} initialAccount={account} />
  );
}
