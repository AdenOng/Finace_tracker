"use client";

import dynamic from "next/dynamic";
import type { ReactNode } from "react";

import type { Locale } from "./config";
import EnglishProvider from "./providers/en";

// The import must live in a client boundary: dynamic imports made only by server
// components do not guarantee client bundle splitting in Next.js.
const ChineseProvider = dynamic(() => import("./providers/zh"));

export function SelectedLocaleProvider({
  locale,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  const Provider = locale === "zh" ? ChineseProvider : EnglishProvider;
  return <Provider>{children}</Provider>;
}
