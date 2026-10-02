import { readFile } from "node:fs/promises";

import { categories } from "./common/categories";
import { currencies } from "./common/currencies";
import { institutions as sgInstitutions } from "./sg/institutions";
import {
  type ParsedPresetPack,
  type PresetPack,
  presetPackSchema,
} from "./types";

/** Built-in packs. Add a folder + entry here to ship defaults for another country. */
const builtInPacks: Record<string, PresetPack> = {
  sg: {
    id: "sg",
    name: "Singapore",
    defaultCurrency: "SGD",
    currencies,
    institutions: sgInstitutions,
    categories,
  },
};

export const builtInPackIds = Object.keys(builtInPacks);

/**
 * Resolve the active pack: a JSON file (PRESET_FILE) wins over a built-in id (DATA_PRESET).
 * Packs are validated so a malformed custom file fails loudly at seed time.
 */
export async function loadPresetPack(options: {
  presetId: string;
  presetFile?: string;
}): Promise<ParsedPresetPack> {
  if (options.presetFile) {
    const raw: unknown = JSON.parse(await readFile(options.presetFile, "utf8"));
    return presetPackSchema.parse(raw);
  }
  const pack = builtInPacks[options.presetId];
  if (!pack) {
    throw new Error(
      `Unknown DATA_PRESET "${options.presetId}". Available: ${builtInPackIds.join(", ")}`,
    );
  }
  return presetPackSchema.parse(pack);
}

export type { ParsedPresetPack, PresetPack } from "./types";
