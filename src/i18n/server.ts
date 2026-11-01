import "server-only";

import { cookies } from "next/headers";

import { defaultLocale, isLocale, localeCookie } from "~/i18n/config";
import { messages } from "~/i18n/messages";

/** The reader's chosen language, from the cookie the switcher sets. */
export async function getLocale() {
  const value = (await cookies()).get(localeCookie)?.value;
  return isLocale(value) ? value : defaultLocale;
}

/** Interface copy for server components and `generateMetadata`. */
export async function getT() {
  return messages[await getLocale()];
}
