import type { Metadata } from "next";

import { AuthHeading } from "~/components/auth/auth-heading";
import { ResetPasswordForm } from "~/components/auth/reset-password-form";
import { findPendingPasswordReset } from "~/server/auth/password-reset";
import { db } from "~/server/db";
import { isEmailConfigured } from "~/server/lib/mailer";

export const metadata: Metadata = { title: "Reset password" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const reset = await findPendingPasswordReset(db, token);

  if (!reset) {
    return (
      <AuthHeading title="This link no longer works">
        It may have expired, been replaced by a newer link or been used already.
        {isEmailConfigured()
          ? " Ask for a new one with “Forgot password?” when signing in, or ask the admin."
          : " Ask the admin for a new reset link."}
      </AuthHeading>
    );
  }

  return (
    <>
      <AuthHeading title="Choose a new password">
        For <strong className="text-ink">{reset.email}</strong>. You will be
        signed out everywhere else.
      </AuthHeading>
      <ResetPasswordForm token={token} />
    </>
  );
}
