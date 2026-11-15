import { spawn } from "node:child_process";
import { userInfo } from "node:os";
import { join } from "node:path";

const userDirectory = process.env.SNAP_REAL_HOME ?? userInfo().homedir;
const child = spawn(
  "opencode",
  ["serve", "--hostname", "127.0.0.1", "--port", "4096"],
  {
    env: {
      ...process.env,
      XDG_DATA_HOME:
        process.env.XDG_DATA_HOME ?? join(userDirectory, ".local", "share"),
      XDG_CONFIG_HOME:
        process.env.XDG_CONFIG_HOME ?? join(userDirectory, ".config"),
    },
    stdio: "inherit",
  },
);
child.on("error", () => {
  console.error(
    "Cannot start OpenCode. Install its CLI and ensure it is on PATH. With Snap Bun, run node --env-file=.env scripts/serve-ai.mjs directly.",
  );
  process.exitCode = 1;
});
process.once("SIGINT", () => child.kill("SIGINT"));
process.once("SIGTERM", () => child.kill("SIGTERM"));
child.on("exit", (code) => {
  process.exitCode = code ?? 1;
});
