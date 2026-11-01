import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getT } from "~/i18n/server";
import { AuthHeading } from "~/components/auth/auth-heading";
import { RegisterForm } from "~/components/auth/register-form";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getT();
  return { title: t.auth.setup.metaTitle };
}
export const dynamic = "force-dynamic";

/** First-run only: the first account created becomes the admin. */
export default async function SetupPage() {
  const t = await getT();
  if ((await db.$count(user)) > 0) redirect("/sign-in");

  return (
    <>
      <AuthHeading title={t.auth.setup.title}>{t.auth.setup.body}</AuthHeading>
      <RegisterForm setup submitLabel={t.auth.setup.submit} />
    </>
  );
}
