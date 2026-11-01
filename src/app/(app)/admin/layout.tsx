import type { ReactNode } from "react";

import { AdminLocaleProvider } from "~/i18n/admin-provider";
import { getLocale } from "~/i18n/server";
import { requireAdminSession } from "~/server/auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminSession();
  const locale = await getLocale();
  return <AdminLocaleProvider locale={locale}>{children}</AdminLocaleProvider>;
}
