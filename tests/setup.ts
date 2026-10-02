import { randomBytes } from "node:crypto";

// Tests always use throwaway configuration, even when Bun loads a developer's .env.
Object.assign(process.env, { NODE_ENV: "test" });
process.env.DATABASE_URL = "postgres://localhost/unused_test_database";
process.env.BETTER_AUTH_SECRET = randomBytes(32).toString("base64");
process.env.APP_ENCRYPTION_KEY = randomBytes(32).toString("base64");
process.env.REQUIRE_TWO_FACTOR = "true";
