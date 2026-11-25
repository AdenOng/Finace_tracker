import type { ReactNode } from "react";

import { AdminLocaleProvider } from "~/i18n/client";
import { adminDictionaries } from "~/i18n/messages";
import { getLocale } from "~/i18n/server";
import { requireAdminSession } from "~/server/auth";

export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  await requireAdminSession();
  const locale = await getLocale();
  return (
    <AdminLocaleProvider messages={adminDictionaries[locale]}>
      {children}
    </AdminLocaleProvider>
  );
}
