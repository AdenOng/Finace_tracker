import type { Locale } from "../config";
import { resolveMessages, type Resolved } from "../template";
import type { Translation } from "../types";
import en from "./en";
import enAdmin from "./en/admin";
import enAdminManage from "./en/adminManage";
import zh from "./zh";
import zhAdmin from "./zh/admin";
import zhAdminManage from "./zh/adminManage";

export type CommonDictionary = Translation<typeof en>;
export type AdminDictionary = Translation<{
  admin: typeof enAdmin;
  adminManage: typeof enAdminManage;
}>;
export type CommonMessages = Resolved<CommonDictionary>;
export type AdminMessages = Resolved<AdminDictionary>;
export type Messages = CommonMessages & AdminMessages;

export const commonDictionaries: Record<Locale, CommonDictionary> = { en, zh };
export const adminDictionaries: Record<Locale, AdminDictionary> = {
  en: { admin: enAdmin, adminManage: enAdminManage },
  zh: { admin: zhAdmin, adminManage: zhAdminManage },
};

export const messages: Record<Locale, Messages> = {
  en: resolveMessages({ ...commonDictionaries.en, ...adminDictionaries.en }),
  zh: resolveMessages({ ...commonDictionaries.zh, ...adminDictionaries.zh }),
};
