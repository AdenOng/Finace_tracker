import { and, eq, isNull } from "drizzle-orm";

import { category, merchantRule } from "~/server/db/schema";
import { writableBy, type AccessScope } from "~/server/lib/access";
import type { FinanceDatabase } from "./guards";

export function normalizeMerchantText(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en-US")
    .replace(/\s+/g, " ");
}

export async function loadMerchantRules(
  db: FinanceDatabase,
  scope: AccessScope,
) {
  const rows = await db
    .select({
      id: merchantRule.id,
      pattern: merchantRule.pattern,
      categoryId: merchantRule.categoryId,
      categoryName: category.name,
      createdAt: merchantRule.createdAt,
    })
    .from(merchantRule)
    .innerJoin(category, eq(category.id, merchantRule.categoryId))
    .where(
      and(writableBy(scope, merchantRule.ownerId), isNull(category.archivedAt)),
    );
  // Specific patterns win. Equal-length patterns use creation time, then id for a stable tie-break.
  return rows.sort(
    (a, b) =>
      b.pattern.length - a.pattern.length ||
      a.createdAt.getTime() - b.createdAt.getTime() ||
      a.id.localeCompare(b.id),
  );
}

export function matchMerchantRule<T extends { pattern: string }>(
  rules: T[],
  row: {
    merchant: string | null;
    description: string;
  },
): T | undefined {
  const texts = [row.merchant ?? "", row.description].map(
    normalizeMerchantText,
  );
  return rules.find((r) =>
    texts.some((text) => text.includes(normalizeMerchantText(r.pattern))),
  );
}
