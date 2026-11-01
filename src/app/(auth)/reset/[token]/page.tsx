import type { Metadata } from "next";

import { getT } from "~/i18n/server";
import { AuthHeading } from "~/components/auth/auth-heading";
import { ResetPasswordForm } from "~/components/auth/reset-password-form";
import { findPendingPasswordReset } from "~/server/auth/password-reset";
import { db } from "~/server/db";
import { isEmailConfigured } from "~/server/lib/mailer";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.auth.reset.metaTitle };
}
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const t = await getT();
  const { token } = await params;
  const reset = await findPendingPasswordReset(db, token);

  if (!reset) {
    return (
      <AuthHeading title={t.auth.reset.expiredTitle}>
        {t.auth.reset.expired}
        {isEmailConfigured() ? t.auth.reset.emailHint : t.auth.reset.adminHint}
      </AuthHeading>
    );
  }

  return (
    <>
      <AuthHeading title={t.auth.reset.title}>
        {t.auth.reset.beforeEmail}
        <strong className="text-ink">{reset.email}</strong>
        {t.auth.reset.afterEmail}
      </AuthHeading>
      <ResetPasswordForm token={token} />
    </>
  );
}
