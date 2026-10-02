import type { ReactNode } from "react";

import { requireAdminSession } from "~/server/auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminSession();
  return children;
}
