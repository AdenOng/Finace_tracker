import { expect, test } from "bun:test";

test("native import HTTP contract keeps authentication, review and balance checks", () => {
  const result = Bun.spawnSync({
    env: { ...process.env, MOBILE_IMPORTS_LIVE: "false" },
    cmd: [
      process.execPath,
      "--preload",
      "./tests/setup.ts",
      "./tests/fixtures/mobile-imports.ts",
    ],
    stdout: "pipe",
    stderr: "pipe",
  });
  const output = result.stdout.toString() + result.stderr.toString();
  if (result.exitCode !== 0) console.error(output);
  expect(result.exitCode).toBe(0);
  expect(output).toContain(
    "Native upload, auth, extraction fixture, review, balance gate and commit passed",
  );
}, 60_000);
