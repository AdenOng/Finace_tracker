import { expect } from "bun:test";
import { createMobileBackend, NativeClient, totp } from "./mobile-backend";
import { mobileStatement, mobileStatementImage } from "./mobile-statement";

const live = process.env.MOBILE_IMPORTS_LIVE === "true";
const backend = await createMobileBackend("http://localhost:3100", {
  fixtureAi: !live,
  liveAi: live
    ? {
        url: process.env.OPENCODE_URL ?? "http://127.0.0.1:4096",
        model:
          process.env.OPENCODE_DEFAULT_MODEL ?? "opencode-go/glm-5.3-flash",
        username: process.env.OPENCODE_SERVER_USERNAME ?? "opencode",
        password: process.env.OPENCODE_SERVER_PASSWORD,
      }
    : undefined,
});
const client = new NativeClient(backend);
const credentials = {
  email: "imports-test@example.com",
  password: "Synthetic-import-test-password-123",
};
try {
  const health = await backend.fetch(
    new Request("http://localhost:3100/api/health"),
  );
  expect(await health.json()).toEqual({ service: "finfolio", status: "ok" });
  expect(
    (
      await client.post(
        "/sign-up/email",
        { ...credentials, name: "Import test" },
        { "x-setup-token": backend.setupToken },
      )
    ).status,
  ).toBe(200);
  const { createCaller } = await import("../../src/server/api/root");
  const { createTRPCContext } = await import("../../src/server/api/trpc");
  const caller = async () =>
    createCaller(
      await createTRPCContext({ headers: new Headers(client.headers()) }),
    );
  expect(
    (
      await backend.fetch(
        new Request("http://localhost:3100/api/imports", {
          method: "POST",
          headers: client.headers(),
        }),
      )
    ).status,
  ).toBe(401);
  const enabled = await client.post("/two-factor/enable", {
    password: credentials.password,
  });
  const { totpURI } = (await enabled.json()) as { totpURI: string };
  expect(
    (
      await client.post("/two-factor/verify-totp", {
        code: totp(new URL(totpURI).searchParams.get("secret")!),
      })
    ).status,
  ).toBe(200);
  const api = await caller();
  const account = await api.accounts.create({
    name: "Isolated import bank",
    type: "savings",
    currency: "SGD",
    institutionId: null,
    last4: "1234",
    notes: "Synthetic only",
  });
  expect((await api.imports.availability()).available).toBe(true);
  const upload = () => {
    const body = new FormData();
    body.set("accountId", account.id);
    body.set(
      "file",
      new File([mobileStatementImage()], "synthetic-statement.png", {
        type: "image/png",
      }),
    );
    return body;
  };
  const send = (headers: Record<string, string> = client.headers()) =>
    backend.fetch(
      new Request("http://localhost:3100/api/imports", {
        method: "POST",
        headers,
        body: upload(),
      }),
    );
  expect((await send({})).status).toBe(401);
  expect(
    (await send(client.headers({ origin: "https://untrusted.example" })))
      .status,
  ).toBe(403);
  const response = await send();
  expect(response.status).toBe(202);
  const { jobId } = (await response.json()) as { jobId: string };
  let job = await api.imports.get({ id: jobId });
  for (let i = 0; i < 240 && ["queued", "running"].includes(job.status); i++) {
    await Bun.sleep(500);
    job = await api.imports.get({ id: jobId });
  }
  if (job.status === "failed")
    throw new Error(job.error ?? "Extraction failed");
  expect(job.status).toBe("needs_review");
  expect(job.balanceCheck.complete).toBe(true);
  expect(job.balanceCheck.requiresAcknowledgment).toBe(false);
  expect(job.rows.filter((r) => r.kind === "transaction")).toHaveLength(1);
  const transaction = job.rows.find((r) => r.kind === "transaction")!;
  expect(transaction.data.amount).toBe("-12.34");
  const listInput = {
    month: mobileStatement().periodEnd!.slice(0, 7),
    accountId: account.id,
    categoryId: null,
  };
  expect(await api.spending.list(listInput)).toHaveLength(0);
  expect((await send()).status).toBe(409);
  await api.imports.updateRows({
    jobId,
    ids: [transaction.id],
    decision: "skip",
  });
  await expect(
    api.imports.commit({ jobId, asOf: mobileStatement().periodEnd! }),
  ).rejects.toThrow();
  expect(await api.spending.list(listInput)).toHaveLength(0);
  await api.imports.updateRows({
    jobId,
    ids: [transaction.id],
    decision: "accept",
    patch: { confirmAmount: true },
  });
  await api.imports.commit({ jobId, asOf: mobileStatement().periodEnd! });
  expect(await api.spending.list(listInput)).toHaveLength(1);
  await expect(
    api.imports.commit({ jobId, asOf: mobileStatement().periodEnd! }),
  ).rejects.toThrow();
  expect(await api.spending.list(listInput)).toHaveLength(1);
  expect((await api.imports.get({ id: jobId })).status).toBe("completed");
  console.log(
    live
      ? "Live mobile import extraction and commit passed"
      : "Native upload, auth, extraction fixture, review, balance gate and commit passed",
  );
} finally {
  await backend.close();
}
