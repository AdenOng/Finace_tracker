import { expect, test } from "bun:test";

test("native auth preserves identity, enrollment, 2FA, CSRF and session expiry", () => {
  // Isolate real auth/PGlite from other suites' global mocks.
  const result = Bun.spawnSync({
    cmd: [process.execPath, "./tests/fixtures/mobile-auth.ts"],
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  if (result.exitCode !== 0)
    throw new Error(`${result.stdout.toString()}\n${result.stderr.toString()}`);
  expect(result.exitCode).toBe(0);
}, 30_000);
