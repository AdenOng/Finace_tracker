import { describe, expect, test } from "bun:test";

import {
  MAX_REQUEST_BYTES,
  parseExtractionUpload,
} from "../src/server/modules/extraction/upload";

function uploadRequest(
  options: { type?: string; bytes?: number; providerId?: string } = {},
) {
  // Construct the HTTP fixture explicitly: Bun 1.3 rewrites File MIME metadata by extension.
  const boundary = "fixture-boundary";
  const filename =
    options.type === "text/html" ? "fixture.html" : "fixture.png";
  const fields =
    options.providerId === undefined
      ? ""
      : `--${boundary}\r\nContent-Disposition: form-data; name="providerId"\r\n\r\n${options.providerId}\r\n`;
  const body = `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${filename}"\r\nContent-Type: ${options.type ?? "image/png"}\r\n\r\n${"A".repeat(options.bytes ?? 4)}\r\n${fields}--${boundary}--\r\n`;
  return new Request("http://localhost/api/admin/extract-preview", {
    method: "POST",
    body,
    headers: { "content-type": `multipart/form-data; boundary=${boundary}` },
  });
}

describe("extraction upload validation", () => {
  test("accepts supported uploads with blank optional selections", async () => {
    const result = await parseExtractionUpload(
      uploadRequest({ providerId: "" }),
    );
    expect(result.file.size).toBe(4);
    expect(result.providerId).toBeUndefined();
  });
  test("rejects malformed selections, empty files and unsupported media", async () => {
    await expect(
      parseExtractionUpload(uploadRequest({ providerId: "not-a-uuid" })),
    ).rejects.toThrow("Invalid provider");
    await expect(
      parseExtractionUpload(uploadRequest({ bytes: 0 })),
    ).rejects.toThrow("non-empty");
    await expect(
      parseExtractionUpload(uploadRequest({ type: "text/html" })),
    ).rejects.toThrow("Unsupported file type");
  });
  test("rejects non-multipart requests", async () => {
    await expect(
      parseExtractionUpload(
        new Request("http://localhost", {
          method: "POST",
          body: "not multipart",
        }),
      ),
    ).rejects.toThrow("valid multipart");
  });
  test("rejects oversized requests before reading their body", async () => {
    const request = uploadRequest();
    request.headers.set("content-length", String(MAX_REQUEST_BYTES + 1));
    await expect(parseExtractionUpload(request)).rejects.toThrow("too large");
    expect(request.bodyUsed).toBe(false);
  });
  test("also enforces limits when a streamed request omits content-length", async () => {
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_REQUEST_BYTES + 1));
      },
      cancel() {
        cancelled = true;
      },
    });
    await expect(
      parseExtractionUpload(
        new Request("http://localhost", { method: "POST", body }),
      ),
    ).rejects.toThrow("too large");
    expect(cancelled).toBe(true);
  });
});
