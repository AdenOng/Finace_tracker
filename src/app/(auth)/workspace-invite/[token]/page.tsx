import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "~/components/auth/auth-heading";
import { RegisterForm } from "~/components/auth/register-form";
import { AcceptWorkspaceInvitation } from "~/components/workspaces/accept-invitation";
import { getSession, needsTwoFactorEnrollment } from "~/server/auth";
import { db } from "~/server/db";
import { findPendingWorkspaceInvitation } from "~/server/modules/workspaces/invitations";

export const metadata: Metadata = { title: "Join workspace" };
export const dynamic = "force-dynamic";
export default async function WorkspaceInvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await findPendingWorkspaceInvitation(db, token);
  if (!invite)
    return (
      <AuthHeading title="This link no longer works">
        It may have expired, been used or been revoked. Ask the workspace owner
        for a new link.
      </AuthHeading>
    );
  const session = await getSession();
  return (
    <>
      <AuthHeading title={`Join ${invite.workspaceName}`}>
        You are invited as a {invite.role}. Everyone in this workspace can view
        its shared accounts. Your accounts stay private until you choose to
        share them.
      </AuthHeading>
      {session ? (
        session.user.email.toLowerCase() !== invite.email.toLowerCase() ? (
          <p className="text-sm">
            This invitation is for {invite.email}. Sign out from Settings and
            sign in with that email address.
          </p>
        ) : needsTwoFactorEnrollment(session.user) ? (
          <p className="text-sm">
            <Link className="font-semibold underline" href="/settings?enroll=1">
              Set up two-step sign-in
            </Link>
            , then reopen this invitation to join.
          </p>
        ) : (
          <AcceptWorkspaceInvitation token={token} />
        )
      ) : (
        <div className="space-y-6">
          <p className="text-sm">
            Already have an account?{" "}
            <Link
              className="font-semibold underline"
              href={`/sign-in?next=${encodeURIComponent(`/workspace-invite/${token}`)}`}
            >
              Sign in to join
            </Link>
            .
          </p>
          <RegisterForm
            lockedEmail={invite.email}
            workspaceInviteToken={token}
            submitLabel="Create account and join"
          />
        </div>
      )}
    </>
  );
}
