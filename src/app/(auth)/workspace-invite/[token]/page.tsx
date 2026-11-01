import type { Metadata } from "next";
import Link from "next/link";

import { getT } from "~/i18n/server";
import { AuthHeading } from "~/components/auth/auth-heading";
import { RegisterForm } from "~/components/auth/register-form";
import { AcceptWorkspaceInvitation } from "~/components/workspaces/accept-invitation";
import { getSession, needsTwoFactorEnrollment } from "~/server/auth";
import { db } from "~/server/db";
import { findPendingWorkspaceInvitation } from "~/server/modules/workspaces/invitations";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.auth.workspaceInvite.metaTitle };
}
export const dynamic = "force-dynamic";
export default async function WorkspaceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const t = await getT();
  const { token } = await params;
  const invite = await findPendingWorkspaceInvitation(db, token);
  if (!invite)
    return (
      <AuthHeading title={t.auth.workspaceInvite.expiredTitle}>
        {t.auth.workspaceInvite.expired}
      </AuthHeading>
    );
  const session = await getSession();
  return (
    <>
      <AuthHeading title={t.auth.workspaceInvite.title(invite.workspaceName)}>
        {t.auth.workspaceInvite.body(t.auth.workspaceInvite.roles[invite.role])}
      </AuthHeading>
      {session ? (
        session.user.email.toLowerCase() !== invite.email.toLowerCase() ? (
          <p className="text-sm">
            {t.auth.workspaceInvite.wrongEmail(invite.email)}
          </p>
        ) : needsTwoFactorEnrollment(session.user) ? (
          <p className="text-sm">
            <Link className="font-semibold underline" href="/settings?enroll=1">
              {t.auth.workspaceInvite.enroll}
            </Link>
            {t.auth.workspaceInvite.enrollAfter}
          </p>
        ) : (
          <AcceptWorkspaceInvitation token={token} />
        )
      ) : (
        <div className="space-y-6">
          <p className="text-sm">
            {t.auth.workspaceInvite.existing}{" "}
            <Link
              className="font-semibold underline"
              href={`/sign-in?next=${encodeURIComponent(`/workspace-invite/${token}`)}`}
            >
              {t.auth.workspaceInvite.signIn}
            </Link>
            {t.auth.workspaceInvite.signInAfter}
          </p>
          <RegisterForm
            lockedEmail={invite.email}
            workspaceInviteToken={token}
            submitLabel={t.auth.workspaceInvite.submit}
          />
        </div>
      )}
    </>
  );
}
