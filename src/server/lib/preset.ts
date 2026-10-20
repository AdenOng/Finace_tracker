import { env } from "~/env";
import { loadPresetPack, type ParsedPresetPack } from "~/presets";
import { cachedInstanceSettings } from "./instance-settings-cache";

let pack: Promise<ParsedPresetPack> | undefined;

/** The active preset pack (DATA_PRESET or PRESET_FILE), read once per process. */
export function activePresetPack() {
  return (pack ??= loadPresetPack({
    presetId: env.DATA_PRESET,
    presetFile: env.PRESET_FILE,
  }));
}

export const preset = {
  /** The pack's features, with any override an admin set under Admin → Data. */
  features: async (): Promise<ParsedPresetPack["features"]> => {
    const { features } = await activePresetPack();
    const cpfSrs = cachedInstanceSettings().cpfSrsEnabled;
    return cpfSrs === null ? features : { ...features, cpfSrs };
  },
};
