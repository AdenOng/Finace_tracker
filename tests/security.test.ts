import { describe, expect, test } from "bun:test";
import { randomBytes } from "node:crypto";

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
