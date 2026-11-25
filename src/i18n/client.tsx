"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useMemo,
  useTransition,
  type ReactNode,
} from "react";

import {
  defaultLocale,
  htmlLang,
  type Locale,
  localeCookie,
} from "~/i18n/config";
import type {
  AdminDictionary,
  CommonDictionary,
  CommonMessages,
  Messages,
} from "~/i18n/messages";
import { resolveMessages } from "~/i18n/template";

// Fallback messages can be registered by tests rendering outside LocaleProvider without
// pulling the English dictionary into Chinese client bundles.
let fallbackMessages: CommonMessages | null = null;

export function setFallbackMessages(messages: CommonDictionary) {
  fallbackMessages = resolveMessages(messages);
}

// Admin groups are supplied by the nested admin provider only. The public hook
// keeps its full type so existing admin call sites remain unchanged.
const LocaleContext = createContext<{
  locale: Locale;
  messages: CommonMessages | null;
}>({ locale: defaultLocale, messages: null });

export function LocaleProvider({
  locale,
  messages,
  children,
}: {
  locale: Locale;
  messages?: CommonDictionary;
  children: ReactNode;
}) {
  const resolved = useMemo(
    () => (messages ? resolveMessages(messages) : fallbackMessages),
    [messages],
  );
  return (
    <LocaleContext.Provider value={{ locale, messages: resolved }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function AdminLocaleProvider({
  messages,
  children,
}: {
  messages: AdminDictionary;
  children: ReactNode;
}) {
  const parent = useContext(LocaleContext);
  const resolved = useMemo(
    () => ({ ...parent.messages, ...resolveMessages(messages) }),
    [parent.messages, messages],
  );
  return (
    <LocaleContext.Provider
      value={{ locale: parent.locale, messages: resolved as Messages }}
    >
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext).locale;
}

/** The interface copy in the reader's language: `t.shell.nav.overview`. */
export function useT(): Messages {
  const messages = useContext(LocaleContext).messages ?? fallbackMessages;
  if (!messages) {
    throw new Error("useT() must be used inside a LocaleProvider");
  }
  return messages as Messages;
}

/** Switches language: remembered for a year, then server components re-render in it. */
export function useSetLocale() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  function setLocale(locale: Locale) {
    document.cookie = `${localeCookie}=${locale}; path=/; max-age=31536000; samesite=lax`;
    // Fonts and `:lang()` typography follow the root element straight away.
    document.documentElement.lang = htmlLang[locale];
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
