export type CategoryKind = "expense" | "income" | "transfer";

/** Each top-level category followed by its children, for flat pickers. */
export function orderCategories<
  T extends { id: string; parentId: string | null },
>(categories: T[]): T[] {
  const ids = new Set(categories.map((c) => c.id));
  // A child whose parent is archived is listed as a top-level entry.
  const roots = categories.filter((c) => !c.parentId || !ids.has(c.parentId));
  return roots.flatMap((root) => [
    root,
    ...categories.filter((c) => c.parentId === root.id),
  ]);
}
