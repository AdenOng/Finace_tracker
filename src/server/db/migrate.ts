/** CLI entry: `bun run db:migrate:run`. Applies SQL migrations from ./drizzle (used in Docker). */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const conn = postgres(url, { max: 1 });
await migrate(drizzle(conn), { migrationsFolder: "./drizzle" });
await conn.end();
console.log("[migrate] done");
