import { expect, test } from "bun:test";

test("import runner: stale attempts, vision fallback, broken fallback keys, kept usage", () => {
  // Isolated so its LLM and storage fakes cannot leak into other test files.
  const result = Bun.spawnSync({
    cmd: [
      process.execPath,
      "--preload",
      "./tests/setup.ts",
      "./tests/fixtures/import-runner.ts",
    ],
    cwd: new URL("..", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = result.stdout.toString() + result.stderr.toString();
  expect(output).toContain("import runner scenarios passed");
  expect(result.exitCode).toBe(0);
}, 30_000);
