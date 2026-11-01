"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import type { Locale } from "./config";

const EnglishProvider = dynamic(() => import("./providers/admin-en"));
const ChineseProvider = dynamic(() => import("./providers/admin-zh"));

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
