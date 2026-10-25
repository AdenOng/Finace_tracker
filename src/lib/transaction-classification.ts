import type { CategoryKind } from "~/lib/categories";

export type ClassificationCategory = {
  id: string;
  parentId: string | null;
  kind: CategoryKind;
};

type Classification = { categoryId: string | null; isTransfer: boolean };

export function categoryKind(
  categories: ClassificationCategory[],
  id: string | null,
): CategoryKind | undefined {
  // Transfer branches include their children, whose stored kind may still be the default expense.
  const seen = new Set<string>();
  let current = categories.find((c) => c.id === id);
  let kind = current?.kind;
  while (current?.parentId && !seen.has(current.id)) {
    seen.add(current.id);
    const parent = categories.find((c) => c.id === current!.parentId);
    if (!parent) break;
    if (parent.kind === "transfer" || kind === "expense") kind = parent.kind;
    current = parent;
  }
  return kind;
}

export function classifyTransaction(
  current: Classification,
  patch: Partial<Classification>,
  categories: ClassificationCategory[],
): Classification {
  let categoryId =
    patch.categoryId === undefined ? current.categoryId : patch.categoryId;
  let isTransfer = patch.isTransfer ?? current.isTransfer;
  const kind = categoryKind(categories, categoryId);
  // Category edits take precedence over a stale transfer flag sent with the row.
  if (patch.categoryId && kind) {
    isTransfer = kind === "transfer";
  } else if (
    patch.isTransfer !== undefined &&
    kind &&
    (kind === "transfer") !== isTransfer
  ) {
    // An explicit type choice clears an incompatible category instead of retaining a misleading label.
    categoryId = null;
  }
  return { categoryId, isTransfer };
}

export function transactionType(
  amount: string,
  isTransfer: boolean,
): CategoryKind {
  return isTransfer
    ? "transfer"
    : amount.startsWith("-")
      ? "expense"
      : "income";
}
