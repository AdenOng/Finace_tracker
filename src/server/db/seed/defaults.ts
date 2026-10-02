import { env } from "~/env";
import { loadPresetPack } from "~/presets";
import type { Database } from "../index";
import { seedCatalog } from "./catalog";

/** Re-insert any default rows that were permanently deleted. Used by the admin console. */
export async function reseedFromActivePack(db: Database) {
  const pack = await loadPresetPack({
    presetId: env.DATA_PRESET,
    presetFile: env.PRESET_FILE,
  });
  return seedCatalog(db, pack);
}
