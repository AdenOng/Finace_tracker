import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { auth } from "./config";

export { auth, APP_NAME, type Session } from "./config";
export { needsTwoFactorEnrollment } from "./enrollment";

/** Session for the current request (deduplicated per render). */
export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() }),
);

export function isAdmin(user: { role?: string | null }) {
  return user.role === "admin";
}

/** For server components/layouts: redirects to sign-in when signed out. */
export async function requireSession() {
  const session = await getSession();
  if (!session) redirect("/sign-in");
  return session;
}

export async function requireAdminSession() {
  const session = await requireSession();
  if (!isAdmin(session.user)) redirect("/");
  return session;
}
