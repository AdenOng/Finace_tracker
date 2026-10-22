import { expect, test } from "bun:test";

for (const mode of ["configured", "missing-token"]) {
  test(`real auth handler security (${mode})`, () => {
    // Keep the real auth instance separate from the router tests' auth mocks.
    const result = Bun.spawnSync({
      cmd: [
        process.execPath,
        "--preload",
        "./tests/setup.ts",
        "./tests/fixtures/auth-security.ts",
        mode,
      ],
      cwd: new URL("..", import.meta.url).pathname,
      stdout: "pipe",
      stderr: "pipe",
    });
    expect(result.stderr.toString()).toBe("");
    expect(result.exitCode).toBe(0);
  }, 30_000);
}
