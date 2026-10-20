import type { instanceSettings } from "~/server/db/schema";

export type InstanceSettings = typeof instanceSettings.$inferSelect;
export type TwoFactorPolicy = "everyone" | "admins" | "off";

export const DEFAULT_INSTANCE_SETTINGS: InstanceSettings = {
  id: 1,
  twoFactorPolicy: null,
  maxSessionDays: null,
  workspaceInviteSignups: true,
  newDeviceAlerts: true,
  documentRetentionDays: null,
  fallbackProviderId: null,
  providerHealthChecks: true,
  priceQuotes: true,
  cpfSrsEnabled: null,
  updatedAt: new Date(0),
};

/**
 * In-process copy of the settings row, so per-request checks (2FA enrolment, session length) stay
 * synchronous and never query the database. Loaded at startup, refreshed by the scheduler and
 * replaced immediately when an admin saves. Kept on globalThis because Next can load this module
 * more than once in one process.
 */
const store = globalThis as unknown as {
  __finfolioInstanceSettings?: InstanceSettings;
};

export function cachedInstanceSettings(): InstanceSettings {
  return store.__finfolioInstanceSettings ?? DEFAULT_INSTANCE_SETTINGS;
}

export function setCachedInstanceSettings(settings: InstanceSettings) {
  store.__finfolioInstanceSettings = settings;
}
