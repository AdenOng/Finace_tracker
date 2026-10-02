import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

const booleanString = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true");

export const env = createEnv({
  /**
   * Server-side environment variables. Validated at build and boot time so the app never starts
   * with a broken configuration.
   */
  server: {
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    DATABASE_URL: z.url(),

    // Auth
    BETTER_AUTH_SECRET: z.string().min(32),
    BETTER_AUTH_URL: z.url().default("http://localhost:3000"),
    REQUIRE_TWO_FACTOR: booleanString,

    // Secrets at rest (LLM API keys, broker API tokens). 32 random bytes, base64 encoded.
    APP_ENCRYPTION_KEY: z
      .string()
      .regex(
        /^[A-Za-z0-9+/]{43}=$/,
        "Use openssl rand -base64 32 to generate an encryption key",
      ),

    // Default catalog preset (see src/presets). PRESET_FILE overrides it with a JSON pack.
    DATA_PRESET: z.string().default("sg"),
    PRESET_FILE: z.string().optional(),

    // opencode server used by the default LLM provider
    OPENCODE_URL: z.url().default("http://localhost:4096"),
    OPENCODE_SERVER_USERNAME: z.string().default("opencode"),
    OPENCODE_SERVER_PASSWORD: z.string().optional(),
    OPENCODE_DEFAULT_MODEL: z.string().default("opencode-go/glm-5.3-flash"),

    UPLOAD_DIR: z.string().default("./data/uploads"),
  },

  client: {},

  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    REQUIRE_TWO_FACTOR: process.env.REQUIRE_TWO_FACTOR,
    APP_ENCRYPTION_KEY: process.env.APP_ENCRYPTION_KEY,
    DATA_PRESET: process.env.DATA_PRESET,
    PRESET_FILE: process.env.PRESET_FILE,
    OPENCODE_URL: process.env.OPENCODE_URL,
    OPENCODE_SERVER_USERNAME: process.env.OPENCODE_SERVER_USERNAME,
    OPENCODE_SERVER_PASSWORD: process.env.OPENCODE_SERVER_PASSWORD,
    OPENCODE_DEFAULT_MODEL: process.env.OPENCODE_DEFAULT_MODEL,
    UPLOAD_DIR: process.env.UPLOAD_DIR,
  },
  skipValidation: !!process.env.SKIP_ENV_VALIDATION,
  emptyStringAsUndefined: true,
});
