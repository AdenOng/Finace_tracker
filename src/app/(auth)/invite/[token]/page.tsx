import type { Metadata } from "next";
import Link from "next/link";

import { getT } from "~/i18n/server";
import { AuthHeading } from "~/components/auth/auth-heading";
import { RegisterForm } from "~/components/auth/register-form";
import { findPendingInvitation } from "~/server/auth/invitations";
import { db } from "~/server/db";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.auth.invite.metaTitle };
}
export const dynamic = "force-dynamic";

export default async function InvitePage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const t = await getT();
  const { token } = await params;
  const invite = await findPendingInvitation(db, token);

  if (!invite) {
    return (
      <AuthHeading title={t.auth.invite.expiredTitle}>
        {t.auth.invite.expiredBefore}
        <Link
          href="/sign-in"
          className="text-brand font-semibold underline underline-offset-4"
        >
          {t.auth.invite.signIn}
        </Link>
        {t.auth.invite.expiredAfter}
      </AuthHeading>
    );
  }

  return (
    <>
      <AuthHeading title={t.auth.invite.title}>
        {t.auth.invite.beforeEmail}
        <strong className="text-ink">{invite.email}</strong>
        {t.auth.invite.afterEmail}
      </AuthHeading>
      <RegisterForm
        lockedEmail={invite.email}
        inviteToken={token}
        submitLabel={t.auth.invite.submit}
      />
    </>
  );
}
