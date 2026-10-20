import { inArray } from "drizzle-orm";

import type { ParsedPresetPack } from "~/presets";
import type { CategoryPresetInput } from "~/presets/types";
import { activePresetPack } from "~/server/lib/preset";
import type { Database } from "../index";
import { category, currency, institution } from "../schema";
import { seedCatalog } from "./catalog";

/** Re-insert any default rows that were permanently deleted. Used by the admin console. */
export async function reseedFromActivePack(db: Database) {
  return seedCatalog(db, await activePresetPack());
}

function categoryKeys(nodes: CategoryPresetInput[]): string[] {
  return nodes.flatMap((n) => [n.key, ...categoryKeys(n.children ?? [])]);
}

/**
 * What applying `pack` would change, without writing: keys that would be inserted, and existing
 * defaults that are archived (which "Restore defaults" brings back).
 */
export async function presetDiff(db: Database, pack: ParsedPresetPack) {
  const catKeys = categoryKeys(pack.categories);
  const instKeys = pack.institutions.map((i) => i.key);
  const codes = pack.currencies.map((c) => c.code);
  const [cats, insts, curs] = await Promise.all([
    catKeys.length
      ? db
          .select({
            key: category.key,
            name: category.name,
            archivedAt: category.archivedAt,
          })
          .from(category)
          .where(inArray(category.key, catKeys))
      : [],
    instKeys.length
      ? db
          .select({
            key: institution.key,
            name: institution.name,
            archivedAt: institution.archivedAt,
          })
          .from(institution)
          .where(inArray(institution.key, instKeys))
      : [],
    codes.length
      ? db
          .select({ code: currency.code })
          .from(currency)
          .where(inArray(currency.code, codes))
      : [],
  ]);
  const haveCat = new Set(cats.map((c) => c.key));
  const haveInst = new Set(insts.map((i) => i.key));
  const haveCur = new Set(curs.map((c) => c.code));
  const names = new Map<string, string>();
  const walk = (nodes: CategoryPresetInput[]) => {
    for (const n of nodes) {
      names.set(n.key, n.name);
      walk(n.children ?? []);
    }
  };
  walk(pack.categories);
  return {
    categories: {
      missing: catKeys
        .filter((k) => !haveCat.has(k))
        .map((k) => names.get(k) ?? k),
      archived: cats.filter((c) => c.archivedAt).map((c) => c.name),
    },
    institutions: {
      missing: pack.institutions
        .filter((i) => !haveInst.has(i.key))
        .map((i) => i.name),
      archived: insts.filter((i) => i.archivedAt).map((i) => i.name),
    },
    currencies: {
      missing: codes.filter((c) => !haveCur.has(c)),
    },
  };
}
