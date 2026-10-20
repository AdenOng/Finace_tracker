import { type Column, getTableName, sql } from "drizzle-orm";

/**
 * `"table"."column"` for the outer side of a correlated subquery in `select({...})`. Drizzle
 * leaves selected columns unqualified when a query has no joins, so a bare `${user.id}` inside
 * `(select … from session where session.user_id = …)` would bind to `session.id` instead.
 */
export function outer(column: Column) {
  return sql`${sql.identifier(getTableName(column.table))}.${sql.identifier(column.name)}`;
}
