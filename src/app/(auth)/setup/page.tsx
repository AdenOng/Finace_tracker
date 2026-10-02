import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { AuthHeading } from "~/components/auth/auth-heading";
import { RegisterForm } from "~/components/auth/register-form";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";

export const metadata: Metadata = { title: "Set up" };
export const dynamic = "force-dynamic";

/** First-run only: the first account created becomes the admin. */
export default async function SetupPage() {
  if ((await db.$count(user)) > 0) redirect("/sign-in");

  return (
    <>
      <AuthHeading title="Create the admin account">
        This is a fresh instance. The account you create now manages users,
        brokers, categories and AI providers.
      </AuthHeading>
      <RegisterForm submitLabel="Create admin account" />
    </>
  );
}
