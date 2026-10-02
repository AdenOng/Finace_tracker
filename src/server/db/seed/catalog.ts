import { sql } from "drizzle-orm";

import type { ParsedPresetPack } from "~/presets";
import type { CategoryPresetInput } from "~/presets/types";
import type { Database } from "../index";
import { category, currency, institution, llmProvider } from "../schema";

export type SeedReport = {
  currencies: number;
  institutions: number;
  categories: number;
  llmProviders: number;
};

/**
 * Insert-only seeding. Existing rows (matched by key/code) are left untouched — including archived
 * ones — so admin edits and deletions survive upgrades and re-runs.
 */
export async function seedCatalog(
  db: Database,
  pack: ParsedPresetPack,
): Promise<SeedReport> {
  return db.transaction(async (tx) => {
    const insertedCurrencies = await tx
      .insert(currency)
      .values(
        pack.currencies.map((c, index) => ({
          code: c.code,
          name: c.name,
          symbol: c.symbol,
          minorUnits: c.minorUnits,
          sortOrder: index,
        })),
      )
      .onConflictDoNothing()
      .returning({ code: currency.code });

    const insertedInstitutions = await tx
      .insert(institution)
      .values(
        pack.institutions.map((i, index) => ({
          key: i.key,
          name: i.name,
          kind: i.kind,
          country: i.country,
          website: i.website,
          ingestMethods: i.ingestMethods,
          apiAdapter: i.apiAdapter,
          extractionHints: i.extractionHints,
          isSystem: true,
          sortOrder: index,
        })),
      )
      .onConflictDoNothing({ target: institution.key })
      .returning({ id: institution.id });

    // Categories are a tree: insert parents first, then resolve parent ids by key.
    let insertedCategories = 0;
    const walk = async (
      nodes: CategoryPresetInput[],
      parentKey: string | null,
      inheritedKind: CategoryPresetInput["kind"],
    ) => {
      for (const [index, node] of nodes.entries()) {
        const kind = node.kind ?? inheritedKind ?? "expense";
        const parentId = parentKey
          ? sql`(select id from ${category} where ${category.key} = ${parentKey})`
          : null;
        const rows = await tx
          .insert(category)
          .values({
            key: node.key,
            name: node.name,
            kind,
            color: node.color,
            aiHint: node.aiHint,
            parentId,
            isSystem: true,
            sortOrder: index,
          })
          .onConflictDoNothing({ target: category.key })
          .returning({ id: category.id });
        insertedCategories += rows.length;
        if (node.children?.length) await walk(node.children, node.key, kind);
      }
    };
    await walk(pack.categories, null, undefined);

    return {
      currencies: insertedCurrencies.length,
      institutions: insertedInstitutions.length,
      categories: insertedCategories,
      llmProviders: 0,
    };
  });
}

/** Creates the platform opencode provider on first boot so extraction works out of the box. */
export async function seedDefaultLlmProvider(
  db: Database,
  options: { baseUrl: string; model: string },
): Promise<number> {
  const existing = await db.$count(llmProvider);
  if (existing > 0) return 0;
  await db.insert(llmProvider).values({
    name: "opencode Go",
    kind: "opencode",
    baseUrl: options.baseUrl,
    defaultModel: options.model,
    supportsVision: true,
    isDefault: true,
  });
  return 1;
}
