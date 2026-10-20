import type { Database } from "~/server/db";
import { instanceSettings } from "~/server/db/schema";
import {
  DEFAULT_INSTANCE_SETTINGS,
  type InstanceSettings,
  setCachedInstanceSettings,
} from "./instance-settings-cache";

export {
  cachedInstanceSettings,
  type InstanceSettings,
  type TwoFactorPolicy,
} from "./instance-settings-cache";

export async function loadInstanceSettings(
  db: Pick<Database, "select">,
): Promise<InstanceSettings> {
  const [row] = await db.select().from(instanceSettings).limit(1);
  const settings = row ?? DEFAULT_INSTANCE_SETTINGS;
  setCachedInstanceSettings(settings);
  return settings;
}

export async function updateInstanceSettings(
  db: Pick<Database, "insert">,
  patch: Partial<Omit<InstanceSettings, "id" | "updatedAt">>,
): Promise<InstanceSettings> {
  const [row] = await db
    .insert(instanceSettings)
    .values({ id: 1, ...patch })
    .onConflictDoUpdate({
      target: instanceSettings.id,
      set: { ...patch, updatedAt: new Date() },
    })
    .returning();
  setCachedInstanceSettings(row!);
  return row!;
}
