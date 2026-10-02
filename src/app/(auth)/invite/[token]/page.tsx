import type { Metadata } from "next";
import Link from "next/link";

import { AuthHeading } from "~/components/auth/auth-heading";
import { RegisterForm } from "~/components/auth/register-form";
import { findPendingInvitation } from "~/server/auth/invitations";
import { db } from "~/server/db";

export const metadata: Metadata = { title: "Accept invitation" };
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const invite = await findPendingInvitation(db, token);

  if (!invite) {
    return (
      <AuthHeading title="This link no longer works">
        It may have expired, been used already or been revoked. Ask the admin
        for a new invitation, or{" "}
        <Link
          href="/sign-in"
          className="text-forest font-semibold underline underline-offset-4"
        >
          sign in
        </Link>{" "}
        if you already have an account.
      </AuthHeading>
    );
  }

  return (
    <>
      <AuthHeading title="You're invited">
        Create your account for{" "}
        <strong className="text-ink">{invite.email}</strong>. Your data stays
        private to you.
      </AuthHeading>
      <RegisterForm
        lockedEmail={invite.email}
        inviteToken={token}
        submitLabel="Create account"
      />
    </>
  );
}
