import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AuthHeading } from "~/components/auth/auth-heading";
import { SignInForm } from "~/components/auth/sign-in-form";
import { getSession } from "~/server/auth";
import { db } from "~/server/db";
import { user } from "~/server/db/schema";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage() {
  if ((await db.$count(user)) === 0) redirect("/setup");
  if (await getSession()) redirect("/");

  return (
    <>
      <AuthHeading title="Sign in">
        Access is by invitation. Ask the admin of this instance for a link.
      </AuthHeading>
      <Suspense>
        <SignInForm />
      </Suspense>
    </>
  );
}
