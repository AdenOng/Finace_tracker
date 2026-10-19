import { expect, test } from "bun:test";

test("pages redirect before protected queries and keep enrollment accessible", () => {
  // Isolate Next/auth mocks from router tests in the main Bun process.
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      "--preload",
      "./tests/setup.ts",
      "./tests/fixtures/enrollment.tsx",
    ],
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  expect(result.stderr.toString()).toBe("");
  expect(result.exitCode).toBe(0);
}, 15_000);
