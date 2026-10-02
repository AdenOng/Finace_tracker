import { z } from "zod";

/**
 * A preset pack is the set of defaults a fresh install starts with. Packs are plain data so that
 * self-hosters can ship their own (via PRESET_FILE=/path/to/pack.json) without touching code.
 *
 * Seeding is insert-only, keyed on `key`: once a row exists the admin console owns it, so re-running
 * the seed (or upgrading to a newer pack) only adds what is missing and never overwrites edits.
 */

const key = z
  .string()
  .regex(/^[a-z0-9][a-z0-9_.-]*$/, "keys are lowercase slugs");

export const currencyPresetSchema = z.object({
  code: z.string().length(3),
  name: z.string(),
  symbol: z.string(),
  minorUnits: z.number().int().min(0).max(4).default(2),
});

export const institutionPresetSchema = z.object({
  key,
  name: z.string(),
  kind: z.enum([
    "broker",
    "bank",
    "card_issuer",
    "crypto_exchange",
    "depository",
    "other",
  ]),
  country: z.string().length(2).optional(),
  website: z.url().optional(),
  ingestMethods: z
    .array(z.enum(["api", "csv", "statement_ocr"]))
    .default(["statement_ocr"]),
  apiAdapter: z.string().optional(),
  extractionHints: z.string().optional(),
});

export type CategoryPresetInput = {
  key: string;
  name: string;
  kind?: "expense" | "income" | "transfer";
  color?: string;
  aiHint?: string;
  children?: CategoryPresetInput[];
};

export const categoryPresetSchema: z.ZodType<CategoryPresetInput> = z.lazy(() =>
  z.object({
    key,
    name: z.string(),
    kind: z.enum(["expense", "income", "transfer"]).optional(),
    color: z
      .string()
      .regex(/^#[0-9a-fA-F]{6}$/)
      .optional(),
    aiHint: z.string().optional(),
    children: z.array(categoryPresetSchema).optional(),
  }),
);

export const presetPackSchema = z.object({
  id: z.string(),
  name: z.string(),
  defaultCurrency: z.string().length(3),
  currencies: z.array(currencyPresetSchema),
  institutions: z.array(institutionPresetSchema),
  categories: z.array(categoryPresetSchema),
});

export type PresetPack = z.input<typeof presetPackSchema>;
export type ParsedPresetPack = z.output<typeof presetPackSchema>;
