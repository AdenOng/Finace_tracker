import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";
import { initTRPC } from "@trpc/server";
import { fetchRequestHandler } from "@trpc/server/adapters/fetch";

import {
  createExpensiveRequestLimiter,
  EXPENSIVE_REQUESTS_PER_MINUTE,
  limitTRPCRequest,
  MAX_TRPC_BATCH_SIZE,
  MAX_TRPC_BODY_BYTES,
  MAX_TRPC_URL_BYTES,
} from "../src/server/lib/request-limits";

import { csvCell, toCsv } from "../src/lib/csv";
import { safeNextPath } from "../src/lib/navigation";
import { formatMoney } from "../src/lib/format";
import {
  decodeEncryptionKey,
  decryptSecretValue,
  encryptSecretValue,
  maskSecret,
} from "../src/server/lib/secret-codec";
import { describeLlmError } from "../src/server/modules/llm/errors";
import { LlmError } from "../src/server/modules/llm/types";

describe("secret encryption", () => {
  const key = randomBytes(32);
  test("accepts a random base64 key and rejects missing, malformed or weak material", () => {
    expect(decodeEncryptionKey(key.toString("base64"))).toEqual(key);
    for (const invalid of [
      "",
      "weak-passphrase",
      randomBytes(16).toString("base64"),
      key.toString("hex"),
    ]) {
      expect(() => decodeEncryptionKey(invalid)).toThrow();
    }
  });
  test("round-trips credentials and produces distinct envelopes", () => {
    const credential = "synthetic-test-value";
    const first = encryptSecretValue(credential, key);
    expect(decryptSecretValue(first, key)).toBe(credential);
    expect(encryptSecretValue(credential, key)).not.toBe(first);
    expect(first).not.toContain(credential);
    expect(decryptSecretValue(encryptSecretValue("", key), key)).toBe("");
  });
  test("detects tampering and rejects the wrong key", () => {
    const encrypted = encryptSecretValue("synthetic-test-value", key);
    const parts = encrypted.split(".");
    const ciphertext = Buffer.from(parts[3]!, "base64url");
    ciphertext[0] = ciphertext[0]! ^ 1;
    parts[3] = ciphertext.toString("base64url");
    expect(() => decryptSecretValue(parts.join("."), key)).toThrow();
    expect(() => decryptSecretValue(encrypted, randomBytes(32))).toThrow();
    expect(() => decryptSecretValue(encrypted + ".extra", key)).toThrow();
  });
  test("never exposes short credentials", () => {
    expect(maskSecret("12345678")).toBe("••••");
    expect(maskSecret("synthetic-test-value")).toBe("syn…alue");
  });
});

describe("public error messages", () => {
  test("does not expose SDK messages or raw provider details", () => {
    expect(
      describeLlmError(new Error("Authorization: private-value")),
    ).not.toContain("private-value");
    expect(
      describeLlmError(
        new LlmError("Provider request failed", {
          apiKey: "private-value",
          prompt: "statement text",
        }),
      ),
    ).toBe("Provider request failed");
  });
});

describe("local redirects", () => {
  test("retains ordinary local routes", () => {
    expect(safeNextPath("/settings?enroll=1")).toBe("/settings?enroll=1");
  });
  test("rejects absolute, protocol-relative and browser-normalized external URLs", () => {
    for (const path of [
      null,
      "https://example.com",
      "//example.com",
      "/\\example.com",
      "/\n/example.com",
      "/\t/example.com",
    ]) {
      expect(safeNextPath(path)).toBe("/");
    }
  });
});

describe("money display", () => {
  test("preserves decimal string precision beyond the safe integer range", () => {
    expect(formatMoney("9007199254740993.10", "SGD")).toBe(
      "S$9,007,199,254,740,993.10",
    );
    expect(formatMoney("999.995", "USD")).toBe("US$1,000.00");
  });
  test("uses currency precision and signed values", () => {
    expect(formatMoney("1234.5", "JPY")).toBe("¥1,235");
    expect(formatMoney("-12.50", "SGD")).toBe("−S$12.50");
    expect(formatMoney("12.50", "SGD", { signed: true })).toBe("+S$12.50");
    expect(() => formatMoney(Infinity, "SGD")).toThrow();
  });
});

describe("CSV export", () => {
  test("neutralises spreadsheet formulas but keeps negative amounts numeric", () => {
    expect(csvCell('=HYPERLINK("x")')).toBe(`"'=HYPERLINK(""x"")"`);
    expect(csvCell("+1 call me")).toBe("'+1 call me");
    expect(csvCell("@SUM(A1)")).toBe("'@SUM(A1)");
    expect(csvCell("-2+3")).toBe("'-2+3");
    expect(csvCell("\tcmd")).toBe("'\tcmd");
    expect(csvCell("-45.10")).toBe("-45.10");
    expect(csvCell(null)).toBe("");
    expect(toCsv([["a,b", "line\nbreak"]])).toBe(`"a,b","line\nbreak"`);
  });
});

describe("tRPC request limits", () => {
  test("rejects oversized declared and streamed bodies, preserves valid JSON and bounds URLs", async () => {
    const url = "http://localhost/api/trpc/example";
    const declared = await limitTRPCRequest(
      new Request(url, {
        method: "POST",
        headers: { "content-length": String(MAX_TRPC_BODY_BYTES + 1) },
        body: "{}",
      }),
    );
    expect(declared).toBeInstanceOf(Response);
    expect((declared as Response).status).toBe(413);

    // Missing or dishonest Content-Length cannot bypass the running byte cap.
    for (const headers of [
      new Headers(),
      new Headers({ "content-length": "2" }),
    ]) {
      let cancelled = false;
      const streamed = await limitTRPCRequest(
        new Request(url, {
          method: "POST",
          headers,
          body: new ReadableStream<Uint8Array>({
            pull(controller) {
              controller.enqueue(new Uint8Array(1024 * 1024));
            },
            cancel() {
              cancelled = true;
            },
          }),
        }),
      );
      expect((streamed as Response).status).toBe(413);
      expect(cancelled).toBe(true);
    }
    const valid = await limitTRPCRequest(
      new Request(url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-test": "preserved" },
        body: '{"text":"€"}',
      }),
    );
    expect(valid).toBeInstanceOf(Request);
    expect((valid as Request).headers.get("x-test")).toBe("preserved");
    expect(await (valid as Request).json()).toEqual({ text: "€" });
    const longUrl = await limitTRPCRequest(
      new Request(url + "?input=" + "x".repeat(MAX_TRPC_URL_BYTES)),
    );
    expect((longUrl as Response).status).toBe(414);
  });

  test("rejects oversized batches before resolving procedures", async () => {
    const t = initTRPC.create();
    let calls = 0;
    const router = t.router({ example: t.procedure.query(() => ++calls) });
    for (const count of [MAX_TRPC_BATCH_SIZE, MAX_TRPC_BATCH_SIZE + 1]) {
      const paths = Array<string>(count).fill("example").join(",");
      const response = await fetchRequestHandler({
        endpoint: "/api/trpc",
        req: new Request(`http://localhost/api/trpc/${paths}?batch=1`),
        router,
        maxBatchSize: MAX_TRPC_BATCH_SIZE,
        createContext: () => ({}),
      });
      expect(response.status).toBe(count === MAX_TRPC_BATCH_SIZE ? 200 : 400);
      if (count > MAX_TRPC_BATCH_SIZE) {
        expect(await response.text()).toContain(
          "Batch call exceeds maximum size",
        );
      }
    }
    expect(calls).toBe(MAX_TRPC_BATCH_SIZE);
  });

  test("shares a sliding-window allowance per user and restores it at expiry", () => {
    const consume = createExpensiveRequestLimiter();
    const start = 100_000;
    for (let i = 0; i < EXPENSIVE_REQUESTS_PER_MINUTE; i++) {
      expect(consume("user-a", start + i * 100)).toBe(true);
    }
    expect(consume("user-a", start + 59_999)).toBe(false);
    expect(consume("user-b", start + 59_999)).toBe(true);
    expect(consume("user-a", start + 60_000)).toBe(true);
    expect(consume("user-a", start + 60_000)).toBe(false);
    expect(consume("user-a", start + 120_000)).toBe(true);
  });
});
