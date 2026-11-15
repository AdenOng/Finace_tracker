import { expect, test } from "bun:test";
import { checkConnection, accessError } from "../src/utils/connection";
import { statementType } from "../src/utils/imports";
import { validDate } from "../src/utils/server";

test("connection probes omit credentials and reject unhealthy or unrelated servers", async () => {
  const fake = (status: number, data: unknown) =>
    (async (_url: unknown, init?: RequestInit) => {
      expect(init?.credentials).toBe("omit");
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return Response.json(data, { status });
    }) as typeof fetch;
  await checkConnection(
    "https://example.test",
    fake(200, { service: "finfolio", status: "ok" }),
  );
  await expect(
    checkConnection("https://example.test", fake(503, {})),
  ).rejects.toThrow("database");
  await expect(
    checkConnection("https://example.test", fake(404, {})),
  ).rejects.toThrow("backend version");
  await expect(
    checkConnection("https://example.test", fake(200, { ok: true })),
  ).rejects.toThrow("healthy Finfolio");
  await expect(checkConnection("https://example.test", (async () => new Response("<html>Wrong server</html>")) as unknown as typeof fetch)).rejects.toThrow("healthy Finfolio");
  await expect(
    checkConnection("https://example.test", (async () => {
      throw new TypeError("offline");
    }) as unknown as typeof fetch),
  ).rejects.toThrow("Cannot reach");
});

test("network and session errors do not tell users to enroll in two-factor", () => {
  expect(accessError({ message: "Failed to fetch" })).toMatchObject({
    title: "Cannot reach your server",
    enrollment: false,
  });
  expect(
    accessError({ message: "Unauthorized", data: { code: "UNAUTHORIZED" } })
      .enrollment,
  ).toBe(false);
  expect(
    accessError({
      message: "Set up two-factor authentication to continue.",
      data: { code: "FORBIDDEN" },
    }).enrollment,
  ).toBe(true);
  expect(
    accessError({ message: "Permission denied", data: { code: "FORBIDDEN" } })
      .enrollment,
  ).toBe(false);
});

test("statement validation handles file-provider MIME omissions and the size limit", () => {
  expect(statementType("Statement.PDF", undefined, 1024)).toBe(
    "application/pdf",
  );
  expect(statementType("capture.png", "application/octet-stream", 1024)).toBe(
    "image/png",
  );
  expect(() => statementType("file.html", "text/html", 1024)).toThrow(
    "Choose a PDF",
  );
  expect(() =>
    statementType("file.pdf", "application/pdf", 20 * 1024 * 1024 + 1),
  ).toThrow("20 MB");
  expect(() => statementType("file.pdf", "application/pdf", 0)).toThrow(
    "nonempty",
  );
});

test("dates reject impossible calendar dates without throwing RangeError", () => {
  expect(validDate("2024-02-29")).toBe(true);
  for (const value of [
    "2025-02-29",
    "2026-11-31",
    "2026-13-01",
    "2026-00-01",
    "",
    "yesterday",
  ])
    expect(validDate(value)).toBe(false);
});
