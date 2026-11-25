import { describe, expect, test } from "bun:test";
import { normalizeServer, shiftMonth } from "../src/utils/server";
import { money, signedAmount } from "../src/utils/money";
describe("trusted server origins", () => {
  test("canonical HTTPS origin", () =>
    expect(normalizeServer(" HTTPS://Finfolio.example:443/ ")).toBe(
      "https://finfolio.example",
    ));
  test("rejects insecure production and remote HTTP even in development", () => {
    for (const input of [
      "http://10.0.2.2:3000",
      "http://example.com",
      "javascript:alert(1)",
    ])
      expect(() => normalizeServer(input)).toThrow();
    expect(() => normalizeServer("http://example.com", true)).toThrow();
  });
  test("accepts local development origins", () =>
    expect(normalizeServer("http://10.0.2.2:3000", true)).toBe(
      "http://10.0.2.2:3000",
    ));
  test("adds a scheme when only the host is typed", () => {
    expect(normalizeServer("finance.example.com")).toBe(
      "https://finance.example.com",
    );
    expect(normalizeServer("10.0.2.2:3100", true)).toBe("http://10.0.2.2:3100");
    expect(normalizeServer("localhost:3000", true)).toBe("http://localhost:3000");
    // Without a development build, a bare local host still means HTTPS.
    expect(normalizeServer("10.0.2.2:3100")).toBe("https://10.0.2.2:3100");
    expect(() => normalizeServer("not a server")).toThrow(
      "doesn't look like a server address",
    );
  });
  test("rejects credentials, paths, queries and fragments", () => {
    for (const input of [
      "https://u:p@example.com",
      "https://example.com/api",
      "https://example.com?q=x",
      "https://example.com/#x",
    ])
      expect(() => normalizeServer(input)).toThrow();
  });
});
describe("decimal money", () => {
  test("keeps values above the safe integer limit exact", () =>
    expect(money("9999999999999999.1234", "SGD")).toBe(
      "S$9,999,999,999,999,999.12",
    ));
  test("rounds decimal ties, minor units, and applies expense direction", () => {
    expect(money("1.005")).toBe("1.01");
    expect(money("1234.567", "IDR")).toBe("Rp 1,235");
    expect(signedAmount("0.0001", true)).toBe("-0.0001");
  });
  test("rejects invalid amounts and precision overflow", () => {
    for (const value of [
      "0",
      "-1",
      "NaN",
      "1e3",
      "1.00001",
      "10000000000000000",
    ])
      expect(() => signedAmount(value, true)).toThrow();
  });
  test("accepts decimal commas and grouped thousands as phones type them", () => {
    expect(signedAmount("12,50", true)).toBe("-12.5");
    expect(signedAmount("1,234.50", false)).toBe("1234.5");
    expect(signedAmount("1,234", false)).toBe("1234");
    expect(signedAmount(" 7,5 ", false)).toBe("7.5");
    for (const value of ["1,2,3", "12,34567", ",5", "1,23.4"])
      expect(() => signedAmount(value, true)).toThrow();
  });
  test("privacy masks even missing amounts", () =>
    expect(money(null, "SGD", { hidden: true })).toBe("••••"));
  test("missing value stays unknown", () => expect(money(null)).toBe("—"));
});
test("month navigation crosses year boundaries", () => {
  expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  expect(shiftMonth("2026-12", 1)).toBe("2027-01");
});
