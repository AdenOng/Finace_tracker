/** Rows per `spending.list` page; the API's maximum. */
export const SPENDING_PAGE_SIZE = 100;

type CursorRow = { postedDate: string; createdAt: string; id: string };

/** The keyset cursor after a full page, without sending the rest of the row back. */
export function nextSpendingCursor(page: CursorRow[]) {
  const last = page.at(-1);
  return page.length === SPENDING_PAGE_SIZE && last
    ? { postedDate: last.postedDate, createdAt: last.createdAt, id: last.id }
    : undefined;
}
