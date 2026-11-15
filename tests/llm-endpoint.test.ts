import { expect, test } from "bun:test";
import { opencodeBaseUrl } from "../src/server/modules/llm/providers";

test("the local default OpenCode URL follows Docker's deployment address without replacing custom providers", () => {
  for (const stored of [null, "http://localhost:4096", "http://127.0.0.1:4096/"])
    expect(opencodeBaseUrl(stored, "http://opencode:4096")).toBe("http://opencode:4096");
  for (const stored of ["https://ai.example.test", "http://localhost:8080", "http://localhost:4096/custom"])
    expect(opencodeBaseUrl(stored, "http://opencode:4096")).toBe(stored);
  expect(opencodeBaseUrl("http://localhost:4096", "http://127.0.0.1:4096")).toBe("http://127.0.0.1:4096");
});
