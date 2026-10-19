import { env } from "~/env";
import { loadPresetPack, type ParsedPresetPack } from "~/presets";

let features: Promise<ParsedPresetPack["features"]> | undefined;

/** Features of the active preset pack (DATA_PRESET or PRESET_FILE), read once per process. */
export const preset = {
  features: () =>
    (features ??= loadPresetPack({
      presetId: env.DATA_PRESET,
      presetFile: env.PRESET_FILE,
    }).then((pack) => pack.features)),
};
