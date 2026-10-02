import { headers } from "next/headers";
import { redirect } from "next/navigation";
import type { ReactNode } from "react";

import { AppShell } from "~/components/shell/app-shell";
import {
  isAdmin,
  needsTwoFactorEnrollment,
  requireSession,
} from "~/server/auth";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: ReactNode }) {
  const session = await requireSession();
  const pathname = (await headers()).get("x-pathname") ?? "/";

  // Instances with REQUIRE_TWO_FACTOR=true keep users on Settings until they enrol.
  if (needsTwoFactorEnrollment(session.user) && pathname !== "/settings") {
    redirect("/settings?enroll=1");
  }

  return (
    <AppShell
      user={{ name: session.user.name, email: session.user.email }}
      isAdmin={isAdmin(session.user)}
    >
      {children}
    </AppShell>
  );
}
