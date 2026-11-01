import { z } from "zod";

/**
 * Shared input validators for financial routers. Numbers arrive as decimal strings sized to their
 * NUMERIC columns (see src/server/db/schema/_columns.ts) so nothing passes through a float.
 */

const decimal = (integerDigits: number, fractionDigits: number) =>
  z
    .string()
    .trim()
    .regex(
      new RegExp(`^-?\\d{1,${integerDigits}}(\\.\\d{1,${fractionDigits}})?$`),
      "Enter a number",
    );

export const moneyInput = decimal(16, 4);
export const priceInput = decimal(16, 8).refine(
  (v) => !v.startsWith("-"),
  "Prices cannot be negative",
);
export const quantityInput = decimal(18, 10);

export const currencyInput = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{3}$/, "Use a three-letter currency code");

export const isoDateInput = z.iso.date();

/**
 * A timestamptz as PostgreSQL prints it (`created_at::text`), for keyset cursors. Keeping the
 * text keeps microseconds that a round trip through a JS Date would drop.
 */
export const pgTimestampText = z
  .string()
  .max(40)
  .regex(
    /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:[+-]\d{2}(?::\d{2})?)$/,
  );

export const monthInput = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");

/** Optional free text: blank becomes null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === "" ? null : v));
