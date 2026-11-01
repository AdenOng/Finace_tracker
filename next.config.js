/**
 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially useful
 * for Docker builds.
 */
import "./src/env.js";

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  // Native canvas binding used to rasterise scanned PDFs; must not be bundled.
  serverExternalPackages: ["@napi-rs/canvas"],
  // Migrations are read from disk at boot (src/server/db/bootstrap.ts).
  outputFileTracingIncludes: {
    "/*": [
      "./drizzle/**/*",
      "./src/server/modules/extraction/pdf-worker.mjs",
      "./node_modules/unpdf/**/*",
      "./node_modules/@napi-rs/canvas/**/*",
      "./node_modules/@napi-rs/canvas-*/**/*",
    ],
  },
  experimental: {
    serverActions: { bodySizeLimit: "20mb" },
  },
};

export default config;
