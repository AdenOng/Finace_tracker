import { expect } from "bun:test";
import { eq } from "drizzle-orm";
import { createMobileBackend, NativeClient, totp } from "./mobile-backend";
import * as schema from "../../src/server/db/schema";

const backend = await createMobileBackend();
const client = new NativeClient(backend);
const credentials = {
  email: "mobile-admin@example.com",
  password: "Synthetic-mobile-password-123",
};
async function rpc(path: string, native = client) {
  return backend.fetch(
    new Request(`http://localhost:3100/api/trpc/${path}`, {
      headers: native.headers(),
    }),
  );
}
try {
  expect(
    (
      await client.post(
        "/sign-up/email",
        { ...credentials, name: "Mobile Admin" },
        {
          "x-setup-token": backend.setupToken,
        },
      )
    ).status,
  ).toBe(200);
  const session = await backend.auth.api.getSession({
    headers: new Headers(client.headers()),
  });
  expect(session?.user.email).toBe(credentials.email);
  const userId = session!.user.id;
  // Real tRPC HTTP transport sees the same user; finance stays gated before enrollment.
  const settings = await rpc("settings.get");
  expect(settings.status).toBe(200);
  expect(await settings.text()).toContain(userId);
  expect((await rpc("accounts.list")).status).toBe(403);
  expect((await rpc("settings.get", new NativeClient(backend))).status).toBe(
    401,
  );
  expect(
    (
      await client.post("/sign-up/email", {
        ...credentials,
        email: "uninvited@example.com",
        name: "Uninvited",
      })
    ).status,
  ).toBe(403);

  const enabled = await client.post("/two-factor/enable", {
    password: credentials.password,
  });
  expect(enabled.status).toBe(200);
  const { totpURI } = (await enabled.json()) as { totpURI: string };
  const secret = new URL(totpURI).searchParams.get("secret")!;
  expect(
    (await client.post("/two-factor/verify-totp", { code: totp(secret) }))
      .status,
  ).toBe(200);
  expect((await rpc("accounts.list")).status).toBe(200);
  expect((await client.post("/sign-out", {})).status).toBe(200);
  expect((await rpc("settings.get")).status).toBe(401);

  const challenge = await client.post("/sign-in/email", credentials);
  expect(challenge.status).toBe(200);
  expect(await challenge.json()).toMatchObject({ twoFactorRedirect: true });
  expect((await rpc("settings.get")).status).toBe(401);
  expect(
    (await client.post("/two-factor/verify-totp", { code: "invalid" })).status,
  ).not.toBe(200);
  expect((await rpc("settings.get")).status).toBe(401);
  expect(
    (await client.post("/two-factor/verify-totp", { code: totp(secret) }))
      .status,
  ).toBe(200);
  expect((await rpc("accounts.list")).status).toBe(200);
  const restored = await backend.fetch(
    new Request("http://localhost:3100/api/auth/get-session", {
      headers: client.headers(),
    }),
  );
  expect(restored.status).toBe(200);
  expect(await restored.json()).toMatchObject({
    user: { id: userId, twoFactorEnabled: true },
  });

  // Existing browser Origin wins: spoofing expo-origin cannot bypass web CSRF.
  const disallowedHeaders: Record<string, string>[] = [
    { origin: "https://evil.example", "expo-origin": "finfolio://" },
    { "expo-origin": "evilapp://" },
    { "expo-origin": "finfolio-evil://" },
    { "expo-origin": "exp://192.168.1.2:8081" },
    { origin: "null", "expo-origin": "finfolio://" },
    { origin: "", "expo-origin": "" },
  ];
  for (const headers of disallowedHeaders) {
    expect((await client.post("/sign-out", {}, headers)).status).toBe(403);
  }
  expect((await rpc("accounts.list")).status).toBe(200);
  expect(
    (
      await client.post("/update-user", {
        name: "Safe native callback",
        callbackURL: "evilapp://callback",
      })
    ).status,
  ).toBe(403);
  expect(
    (
      await client.post(
        "/update-user",
        { name: "Web still works" },
        {
          origin: "http://localhost:3100",
        },
      )
    ).status,
  ).toBe(200);

  // Native cookies still go through the app's session policy.
  const { getSessionFor } =
    await import("../../src/server/auth/session-policy");
  const { setCachedInstanceSettings, DEFAULT_INSTANCE_SETTINGS } =
    await import("../../src/server/lib/instance-settings-cache");
  setCachedInstanceSettings({
    ...DEFAULT_INSTANCE_SETTINGS,
    maxSessionDays: 1,
  });
  const current = await getSessionFor(new Headers(client.headers()));
  await backend.db
    .update(schema.session)
    .set({ createdAt: new Date(Date.now() - 2 * 86_400_000) })
    .where(eq(schema.session.id, current!.session.id));
  expect((await rpc("settings.get")).status).toBe(401);
} finally {
  await backend.close();
}
