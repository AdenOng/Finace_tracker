"use client";

import type { ReactNode } from "react";

import { LocaleProvider, useLocale, useT } from "../client";
import admin from "../messages/zh/admin";
import adminManage from "../messages/zh/adminManage";

export default function AdminProvider({ children }: { children: ReactNode }) {
  const locale = useLocale();
  const messages = { ...useT(), admin, adminManage };
  return (
    <LocaleProvider locale={locale} messages={messages}>
      {children}
    </LocaleProvider>
  );
}
