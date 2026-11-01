/** Languages the interface is offered in. Shared by server and client code. */

export const locales = ["en", "zh"] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = "en";

/** A cookie rather than a user setting, so the sign-in page and setup speak it too. */
export const localeCookie = "finfolio-locale";

export function isLocale(value: unknown): value is Locale {
  return locales.includes(value as Locale);
}

/** Each language named in itself, for the switcher. */
export const localeNames: Record<Locale, string> = {
  en: "English",
  zh: "简体中文",
};

/** BCP 47 tag for `<html lang>`; picks Simplified Chinese glyphs and CSS `:lang(zh)` rules. */
export const htmlLang: Record<Locale, string> = { en: "en", zh: "zh-Hans" };

/** Locale for dates and relative times. Money keeps one format (S$1,234.50) in every language. */
export const intlLocale: Record<Locale, string> = { en: "en-SG", zh: "zh-CN" };
