import { category } from "~/server/db/schema";
import type { FinanceDatabase } from "./guards";

export { classifyTransaction } from "~/lib/transaction-classification";

/** Include archived parents so existing and child categories retain their effective kind. */
export function loadClassificationCategories(db: FinanceDatabase) {
  return db
    .select({
      id: category.id,
      key: category.key,
      kind: category.kind,
      parentId: category.parentId,
      archivedAt: category.archivedAt,
    })
    .from(category);
}
