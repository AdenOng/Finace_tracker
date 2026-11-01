"use client";

import type { ReactNode } from "react";

import type { Locale } from "./config";
// Static on purpose: a next/dynamic provider broke hydration of useId-based IDs at the root,
// and admin pages render useId consumers (drawers) beneath this one. Only /admin loads these.
import EnglishProvider from "./providers/admin-en";
import ChineseProvider from "./providers/admin-zh";

export function AdminLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const Provider = locale === "zh" ? ChineseProvider : EnglishProvider;
  return <Provider>{children}</Provider>;
}
