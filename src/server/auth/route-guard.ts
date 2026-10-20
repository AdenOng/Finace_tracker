import "server-only";

import { NextResponse } from "next/server";

import { env } from "~/env";
import { needsTwoFactorEnrollment } from "./enrollment";
import { getSessionFor } from "./session-policy";

/**
 * For admin-only route handlers: an enrolled admin session from this origin, or a 403 response
 * to return as is.
 */
export async function requireAdminRequest(request: Request) {
  const session = await getSessionFor(request.headers);
  if (
    session?.user.role !== "admin" ||
    needsTwoFactorEnrollment(session.user)
  ) {
    return {
      session: null,
      denied: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  const origin = request.headers.get("origin");
  if (origin && origin !== new URL(env.BETTER_AUTH_URL).origin) {
    return {
      session: null,
      denied: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session, denied: null };
}
