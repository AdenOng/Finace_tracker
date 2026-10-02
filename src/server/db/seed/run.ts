/**
 * CLI entry: `bun run db:seed`. Safe to run on every boot — it only inserts missing defaults.
 */
import { env } from "~/env";
import { loadPresetPack } from "~/presets";
import { db } from "../index";
import { seedCatalog, seedDefaultLlmProvider } from "./catalog";

const pack = await loadPresetPack({
  presetId: env.DATA_PRESET,
  presetFile: env.PRESET_FILE,
});
const report = await seedCatalog(db, pack);
report.llmProviders = await seedDefaultLlmProvider(db, {
  baseUrl: env.OPENCODE_URL,
  model: env.OPENCODE_DEFAULT_MODEL,
});

console.log(`[seed] pack "${pack.id}" →`, report);
process.exit(0);
