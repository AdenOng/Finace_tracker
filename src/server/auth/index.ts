import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";

import { needsTwoFactorEnrollment } from "./enrollment";
import { getSessionFor } from "./session-policy";

export { auth, APP_NAME, type Session } from "./config";
export { needsTwoFactorEnrollment } from "./enrollment";
export { getSessionFor } from "./session-policy";

/** Session for the current request (deduplicated per render). */
export const getSession = cache(async () => getSessionFor(await headers()));

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
  const session = await requireEnrolledSession();
  if (!isAdmin(session.user)) redirect("/");
  return session;
}

/** Call before page queries: layouts and pages can render concurrently. */
export async function requireEnrolledSession() {
  const session = await requireSession();
  if (needsTwoFactorEnrollment(session.user)) {
    redirect("/settings?enroll=1");
  }
  return session;
}
