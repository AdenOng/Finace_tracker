"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useTransition,
  type ReactNode,
} from "react";

import {
  defaultLocale,
  htmlLang,
  type Locale,
  localeCookie,
} from "~/i18n/config";
import type { CommonMessages, Messages } from "~/i18n/messages";
import english from "~/i18n/messages/en";

// Admin groups are supplied by the nested admin provider only. The public hook
// keeps its full type so existing admin call sites remain unchanged.
const LocaleContext = createContext<{
  locale: Locale;
  messages: CommonMessages;
}>({ locale: defaultLocale, messages: english });

export function LocaleProvider({
  locale,
  messages = english,
  children,
}: {
  locale: Locale;
  messages?: CommonMessages;
  children: ReactNode;
}) {
  return (
    <LocaleContext.Provider value={{ locale, messages }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext).locale;
}

/** The interface copy in the reader's language: `t.shell.nav.overview`. */
export function useT(): Messages {
  return useContext(LocaleContext).messages as Messages;
}

/** Switches language: remembered for a year, then server components re-render in it. */
export function useSetLocale() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function setLocale(locale: Locale) {
    document.cookie = `${localeCookie}=${locale}; path=/; max-age=31536000; samesite=lax`;
    // Fonts and `:lang()` typography follow the root element straight away.
    document.documentElement.lang = htmlLang[locale];
    // Fetch the dictionary chunk alongside the refresh so the swap doesn't blank the page.
    if (locale === "zh") void import("~/i18n/providers/zh");
    startTransition(() => router.refresh());
  }
  return [setLocale, pending] as const;
}

/** A category's name in the reader's language when it is one of the presets. */
export function categoryLabel(t: Messages, name: string) {
  return (
    (t.common.categories as Record<string, string | undefined>)[name] ?? name
  );
}
