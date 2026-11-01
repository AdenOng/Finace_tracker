import type { Locale } from "../config";
import type { Translation } from "../types";
import en from "./en";
import enAdmin from "./en/admin";
import enAdminManage from "./en/adminManage";
import zh from "./zh";
import zhAdmin from "./zh/admin";
import zhAdminManage from "./zh/adminManage";

export type CommonMessages = Translation<typeof en>;
export type AdminMessages = Translation<{
  admin: typeof enAdmin;
  adminManage: typeof enAdminManage;
}>;
export type Messages = CommonMessages & AdminMessages;

// Server-side aggregate. Client providers import individual locale/group entries.
export const messages: Record<Locale, Messages> = {
  en: { ...en, admin: enAdmin, adminManage: enAdminManage },
  zh: { ...zh, admin: zhAdmin, adminManage: zhAdminManage },
};
