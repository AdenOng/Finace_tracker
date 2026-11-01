"use client";

import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import {
  defaultLocale,
  htmlLang,
  type Locale,
  localeCookie,
} from "~/i18n/config";
import { type Messages, messages } from "~/i18n/messages";

// Outside the provider (tests, isolated renders) everything is English and switching is a no-op.
const LocaleContext = createContext<{
  locale: Locale;
  setLocale: (locale: Locale) => void;
}>({ locale: defaultLocale, setLocale: () => undefined });

export function LocaleProvider({
  locale: initial,
  children,
}: {
  locale: Locale;
  children: ReactNode;
}) {
  // Client components switch at once; server-rendered copy follows the refresh.
  const [locale, setLocale] = useState(initial);
  useEffect(() => setLocale(initial), [initial]);
  return (
    <LocaleContext.Provider value={{ locale, setLocale }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext).locale;
}

/** The interface copy in the reader's language: `t.shell.nav.overview`. */
export function useT(): Messages {
  return messages[useLocale()];
}

/** Switches language: remembered for a year, then server components re-render in it. */
export function useSetLocale() {
  const router = useRouter();
  const { setLocale: setContextLocale } = useContext(LocaleContext);
  const [pending, startTransition] = useTransition();
  function setLocale(locale: Locale) {
    document.cookie = `${localeCookie}=${locale}; path=/; max-age=31536000; samesite=lax`;
    // Fonts and `:lang()` typography follow the root element straight away.
    document.documentElement.lang = htmlLang[locale];
    setContextLocale(locale);
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
