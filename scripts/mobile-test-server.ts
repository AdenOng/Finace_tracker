/** Local-only disposable real-auth/tRPC server; no Next bootstrap or production DB. */
import { randomBytes } from "node:crypto";
import {
  createMobileBackend,
  NativeClient,
  totp,
} from "../tests/fixtures/mobile-backend";
import { seedMobileFinance } from "../tests/fixtures/mobile-finance";

const port = Number(process.env.MOBILE_TEST_PORT ?? 3100);
const hostname = process.env.MOBILE_TEST_HOST ?? "127.0.0.1";
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw new Error("MOBILE_TEST_PORT must be an integer between 1024 and 65535");
if (!["127.0.0.1", "0.0.0.0"].includes(hostname))
  throw new Error("MOBILE_TEST_HOST must be 127.0.0.1 or 0.0.0.0");
const origin = `http://localhost:${port}`;
const aiMode = process.env.MOBILE_TEST_AI;
if (aiMode && !["fixture", "live"].includes(aiMode)) throw new Error("MOBILE_TEST_AI must be fixture or live");
const backend = await createMobileBackend(origin, {
  fixtureAi: aiMode === "fixture",
  liveAi: aiMode === "live" ? {
    url: process.env.OPENCODE_URL ?? "http://127.0.0.1:4096",
    model: process.env.OPENCODE_DEFAULT_MODEL ?? "opencode-go/glm-5.3-flash",
    username: process.env.OPENCODE_SERVER_USERNAME ?? "opencode",
    password: process.env.OPENCODE_SERVER_PASSWORD,
  } : undefined,
});
const client = new NativeClient(backend, origin);
const credentials = {
  email: "mobile-admin@example.com",
  password: `Mobile-test-${randomBytes(12).toString("hex")}`,
};
try {
  const registered = await client.post(
    "/sign-up/email",
    {
      ...credentials,
      name: "Disposable Mobile Admin",
    },
    { "x-setup-token": backend.setupToken },
  );
  if (!registered.ok)
    throw new Error(`Fixture signup failed: ${registered.status}`);
  const enabled = await client.post("/two-factor/enable", {
    password: credentials.password,
  });
  if (!enabled.ok)
    throw new Error(`Fixture 2FA setup failed: ${enabled.status}`);
  const { totpURI, backupCodes } = (await enabled.json()) as {
    totpURI: string;
    backupCodes: string[];
  };
  const secret = new URL(totpURI).searchParams.get("secret")!;
  const verified = await client.post("/two-factor/verify-totp", {
    code: totp(secret),
  });
  if (!verified.ok)
    throw new Error(`Fixture 2FA verification failed: ${verified.status}`);
  const { createCaller } = await import("../src/server/api/root");
  const { createTRPCContext } = await import("../src/server/api/trpc");
  await seedMobileFinance(
    createCaller(
      await createTRPCContext({ headers: new Headers(client.headers()) }),
    ),
  );
  await client.post("/sign-out", {});
  const server = Bun.serve({
    port,
    hostname,
    fetch: (request) => backend.fetch(request),
  });
  console.log(`Disposable Finfolio backend listening on ${hostname}:${port}`);
  console.log(`AI mode: ${aiMode ?? "disabled"}`);
  console.log(`Email: ${credentials.email}\nPassword: ${credentials.password}`);
  console.log(`TOTP secret (add to an authenticator): ${secret}`);
  console.log(`TOTP URI: ${totpURI}`);
  console.log(`Single-use backup codes: ${backupCodes.join(", ")}`);
  console.log(
    `Uploads: ${backend.uploads}\nAll database data disappears on exit.`,
  );
  const shutdown = async () => {
    await server.stop(true);
    await backend.close();
    process.exit(0);
  };
  process.once("SIGINT", () => void shutdown());
  process.once("SIGTERM", () => void shutdown());
} catch (error) {
  await backend.close();
  throw error;
}
