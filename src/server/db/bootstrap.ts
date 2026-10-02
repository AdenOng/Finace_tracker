import path from "node:path";
import { migrate } from "drizzle-orm/postgres-js/migrator";

import { env } from "~/env";
import { loadPresetPack } from "~/presets";
import { db } from "./index";
import { seedCatalog, seedDefaultLlmProvider } from "./seed/catalog";

/**
 * Runs on server start (src/instrumentation.ts): apply pending migrations, then insert any missing
 * defaults. Both steps are idempotent, so every container restart is safe.
 */
export async function bootstrapDatabase() {
  const started = Date.now();
  await migrate(db, { migrationsFolder: path.join(process.cwd(), "drizzle") });
  const pack = await loadPresetPack({
    presetId: env.DATA_PRESET,
    presetFile: env.PRESET_FILE,
  });
  const report = await seedCatalog(db, pack);
  report.llmProviders = await seedDefaultLlmProvider(db, {
    baseUrl: env.OPENCODE_URL,
    model: env.OPENCODE_DEFAULT_MODEL,
  });
  console.log(
    `[bootstrap] migrated + seeded "${pack.id}" in ${Date.now() - started}ms`,
    report,
  );
}
