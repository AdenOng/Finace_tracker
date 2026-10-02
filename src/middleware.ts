import { getSessionCookie } from "better-auth/cookies";
import { type NextRequest, NextResponse } from "next/server";

/** Routes reachable without a session. Everything else bounces to /sign-in. */
const PUBLIC_PREFIXES = ["/sign-in", "/setup", "/invite/", "/two-factor"];

/**
 * Optimistic check on the session cookie only — real validation happens in layouts and tRPC
 * procedures. Also forwards the pathname so server layouts can make routing decisions.
 */
export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const isPublic = PUBLIC_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix),
  );

  if (!isPublic && !getSessionCookie(request)) {
    const url = new URL("/sign-in", request.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  const headers = new Headers(request.headers);
  headers.set("x-pathname", pathname);
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/((?!api/|_next/|favicon|.*\\.(?:svg|png|jpg|ico|webp)$).*)"],
};
