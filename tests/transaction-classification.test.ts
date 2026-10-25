import { expect, test } from "bun:test";
import {
  categoryKind,
  classifyTransaction,
  transactionType,
} from "../src/lib/transaction-classification";

const categories = [
  { id: "transfer", parentId: null, kind: "transfer" as const },
  { id: "child", parentId: "transfer", kind: "expense" as const },
  { id: "expense", parentId: null, kind: "expense" as const },
  { id: "income", parentId: null, kind: "income" as const },
  { id: "explicit-transfer", parentId: "expense", kind: "transfer" as const },
];

test("category choices derive transfer status, including inherited kinds and stale flags", () => {
  expect(categoryKind(categories, "child")).toBe("transfer");
  expect(categoryKind(categories, "explicit-transfer")).toBe("transfer");
  for (const categoryId of ["transfer", "child", "expense", "income"]) {
    expect(
      classifyTransaction(
        { categoryId: null, isTransfer: categoryId === "expense" },
        { categoryId, isTransfer: false },
        categories,
      ),
    ).toEqual({
      categoryId,
      isTransfer: ["transfer", "child"].includes(categoryId),
    });
  }
});

test("type choices clear incompatible categories and preserve compatible ones", () => {
  expect(
    classifyTransaction(
      { categoryId: "expense", isTransfer: false },
      { isTransfer: true },
      categories,
    ),
  ).toEqual({ categoryId: null, isTransfer: true });
  expect(
    classifyTransaction(
      { categoryId: "child", isTransfer: true },
      { isTransfer: false },
      categories,
    ),
  ).toEqual({ categoryId: null, isTransfer: false });
  expect(
    classifyTransaction(
      { categoryId: "child", isTransfer: true },
      { isTransfer: true },
      categories,
    ),
  ).toEqual({ categoryId: "child", isTransfer: true });
  expect(
    classifyTransaction(
      { categoryId: "child", isTransfer: true },
      { categoryId: null },
      categories,
    ),
  ).toEqual({ categoryId: null, isTransfer: true });
  expect(transactionType("-25", false)).toBe("expense");
  expect(transactionType("25", false)).toBe("income");
  expect(transactionType("-25", true)).toBe("transfer");
});

test("unrelated edits preserve legacy classifications that differ from their category", () => {
  for (const current of [
    { categoryId: "expense", isTransfer: true },
    { categoryId: "child", isTransfer: false },
  ]) {
    expect(classifyTransaction(current, {}, categories)).toEqual(current);
  }
});
