import type { Locale } from "../config";
import type { Translation } from "../types";
import enAccounts from "./en/accounts";
import enAdmin from "./en/admin";
import enAdminManage from "./en/adminManage";
import enAuth from "./en/auth";
import enCommon from "./en/common";
import enImports from "./en/imports";
import enLanding from "./en/landing";
import enOverview from "./en/overview";
import enPlanning from "./en/planning";
import enPortfolio from "./en/portfolio";
import enSettings from "./en/settings";
import enShell from "./en/shell";
import enSpending from "./en/spending";
import enWorkspaces from "./en/workspaces";
import zhAccounts from "./zh/accounts";
import zhAdmin from "./zh/admin";
import zhAdminManage from "./zh/adminManage";
import zhAuth from "./zh/auth";
import zhCommon from "./zh/common";
import zhImports from "./zh/imports";
import zhLanding from "./zh/landing";
import zhOverview from "./zh/overview";
import zhPlanning from "./zh/planning";
import zhPortfolio from "./zh/portfolio";
import zhSettings from "./zh/settings";
import zhShell from "./zh/shell";
import zhSpending from "./zh/spending";
import zhWorkspaces from "./zh/workspaces";

const en = {
  common: enCommon,
  shell: enShell,
  auth: enAuth,
  landing: enLanding,
  overview: enOverview,
  planning: enPlanning,
  accounts: enAccounts,
  portfolio: enPortfolio,
  spending: enSpending,
  workspaces: enWorkspaces,
  imports: enImports,
  settings: enSettings,
  admin: enAdmin,
  adminManage: enAdminManage,
};

export type Messages = Translation<typeof en>;

const zh: Messages = {
  common: zhCommon,
  shell: zhShell,
  auth: zhAuth,
  landing: zhLanding,
  overview: zhOverview,
  planning: zhPlanning,
  accounts: zhAccounts,
  portfolio: zhPortfolio,
  spending: zhSpending,
  workspaces: zhWorkspaces,
  imports: zhImports,
  settings: zhSettings,
  admin: zhAdmin,
  adminManage: zhAdminManage,
};

export const messages: Record<Locale, Messages> = { en, zh };
