import { eq, isNull } from "drizzle-orm";
import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { Landing } from "~/components/landing/landing";
import { getSession } from "~/server/auth";
import { db } from "~/server/db";
import { currency, institution, user } from "~/server/db/schema";

export const metadata: Metadata = { title: "Sign in" };
export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  if ((await db.$count(user)) === 0) redirect("/setup");
  if (await getSession()) redirect("/");

  const [institutionCount, currencyCount, { next }] = await Promise.all([
    db.$count(institution, isNull(institution.archivedAt)),
    db.$count(currency, eq(currency.isActive, true)),
    searchParams,
  ]);

  return (
    <Landing
      institutionCount={institutionCount}
      currencyCount={currencyCount}
      // Arriving from a protected page: go straight to the form.
      openSignIn={!!next}
    />
  );
}
