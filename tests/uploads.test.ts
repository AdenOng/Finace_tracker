import { describe, expect, spyOn, test } from "bun:test";

import { z } from "zod";
import { prepareDocumentInput } from "../src/server/modules/extraction/prepare-input";
import { createOpencodeAdapter } from "../src/server/modules/llm/adapters/opencode";

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

// Small, self-contained PDFs; no binary fixtures or canvas mocks needed.
function pdfInput(count: number, box = "0 0 612 792") {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    `<< /Type /Pages /Count ${count} /Kids [${Array.from({ length: count }, (_, i) => `${i + 3} 0 R`).join(" ")}] >>`,
    ...Array.from(
      { length: count },
      () => `<< /Type /Page /Parent 2 0 R /MediaBox [${box}] >>`,
    ),
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = objects.map((object, i) => {
    const offset = pdf.length;
    pdf += `${i + 1} 0 obj\n${object}\nendobj\n`;
    return offset;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(pdf);
}

test("PDF worker rejects huge MediaBox geometry before rendering", async () => {
  await expect(
    prepareDocumentInput(pdfInput(1, "0 0 20000 20000"), "application/pdf"),
  ).rejects.toThrow("unsupported page size");
});

test("PDF worker rejects page counts before text extraction", async () => {
  // These pages also have invalid geometry: the count check must run first.
  await expect(
    prepareDocumentInput(pdfInput(101, "0 0 20000 20000"), "application/pdf"),
  ).rejects.toThrow("101 pages; the limit is 100");
});

test("opencode session creation receives the request cancellation signal", async () => {
  let received: AbortSignal | undefined;
  const fetchSpy = spyOn(globalThis, "fetch").mockImplementation(
    Object.assign(
      async (input: RequestInfo | URL) => {
        if (input instanceof Request) received = input.signal;
        return Response.json({ error: "fixture failure" }, { status: 500 });
      },
      { preconnect: fetch.preconnect },
    ),
  );
  try {
    const controller = new AbortController();
    const adapter = createOpencodeAdapter({
      kind: "opencode",
      defaultModel: "provider/model",
    });
    await expect(
      adapter.generateStructured({
        system: "test",
        prompt: "test",
        schema: z.object({}),
        schemaName: "test",
        signal: controller.signal,
      }),
    ).rejects.toThrow();
    expect(received).toBeDefined();
    controller.abort();
    expect(received!.aborted).toBe(true);
  } finally {
    fetchSpy.mockRestore();
  }
});
