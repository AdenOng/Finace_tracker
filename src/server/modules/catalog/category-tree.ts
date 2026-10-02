export type CategoryParent = {
  id: string;
  key: string;
  parentId: string | null;
  archivedAt: Date | null;
};

export class CategoryTreeError extends Error {}

/** The catalog supports a root and one level of active children, with no cycles. */
export function validateCategoryParent(input: {
  categoryId?: string;
  parentId: string | null;
  parent: CategoryParent | null;
  hasChildren?: boolean;
}): void {
  if (!input.parentId) return;
  if (input.categoryId === input.parentId) {
    throw new CategoryTreeError("A category cannot be its own parent");
  }
  if (!input.parent || input.parent.archivedAt) {
    throw new CategoryTreeError("Pick an active parent category");
  }
  if (input.parent.parentId || input.hasChildren) {
    throw new CategoryTreeError("Categories can only be nested one level deep");
  }
}
