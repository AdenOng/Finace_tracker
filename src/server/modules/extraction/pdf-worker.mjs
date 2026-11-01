// This file is deliberately plain ESM: Node can execute it directly in standalone
// output and when the parent is running under Bun, without a TS loader or bundler.
import { getDocumentProxy, renderPageAsImage } from "unpdf";

const MAX_PAGES = 100;
const MAX_TEXT_CHARS = 1_000_000;
const MAX_IMAGE_PAGES = 15;
const MIN_TEXT_CHARS = 80;
const MAX_PAGE_POINTS = 14_400; // 200 inches: reject absurd source geometry.
const MAX_RENDER_DIMENSION = 4_096;
const MAX_RENDER_PIXELS = 4_000_000; // At most ~16 MB of RGBA canvas per page.
const MAX_IMAGE_BYTES = 32 * 1024 * 1024;
const RENDER_SCALE = 2;

async function prepare(data, filename) {
  const pdf = await getDocumentProxy(
    new Uint8Array(Buffer.from(data, "base64")),
  ).catch(() => {
    throw new Error(
      "This PDF could not be read. Upload an unlocked, valid PDF.",
    );
  });
  try {
    const totalPages = pdf.numPages;
    if (totalPages > MAX_PAGES) {
      throw new Error(
        `This PDF has ${totalPages} pages; the limit is ${MAX_PAGES}. Split it and upload the parts.`,
      );
    }
    const pages = [];
    const scannedPages = [];
    let textLength = 0;
    // Extract sequentially instead of unpdf's all-pages Promise.all. Check geometry
    // before even extracting text, and stop as soon as either budget is exceeded.
    for (let i = 1; i <= totalPages; i++) {
      const page = await pdf.getPage(i);
      try {
        const { width, height } = page.getViewport({ scale: 1 });
        if (
          !Number.isFinite(width) ||
          !Number.isFinite(height) ||
          width <= 0 ||
          height <= 0 ||
          width > MAX_PAGE_POINTS ||
          height > MAX_PAGE_POINTS
        ) {
          throw new Error(
            `PDF page ${i} has an unsupported page size (maximum ${MAX_PAGE_POINTS} points per side).`,
          );
        }
        const parts = [];
        // Stream chunks so a single text-heavy page cannot accumulate an
        // unbounded text layer before the document-wide limit is checked.
        const reader = page.streamTextContent().getReader();
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const item of value.items) {
              if (!("str" in item)) continue;
              textLength += item.str.length + 1;
              if (textLength > MAX_TEXT_CHARS) {
                throw new Error(
                  `This PDF exceeds the ${MAX_TEXT_CHARS} character text limit. Split it and upload the parts.`,
                );
              }
              parts.push(item.str, item.hasEOL ? "\n" : " ");
            }
          }
        } finally {
          await reader.cancel();
          reader.releaseLock();
        }
        const text = parts.join("").trim();
        pages.push(text);
        if (text.length < MIN_TEXT_CHARS) {
          scannedPages.push(i);
          if (scannedPages.length > MAX_IMAGE_PAGES) {
            throw new Error(
              `This PDF has too many scanned pages; the limit is ${MAX_IMAGE_PAGES}. Split it and upload the parts.`,
            );
          }
        }
      } finally {
        page.cleanup();
      }
    }
    const files = [];
    let imageBytes = 0;
    for (const i of scannedPages) {
      const page = await pdf.getPage(i);
      const base = page.getViewport({ scale: 1 });
      let scale = Math.min(
        RENDER_SCALE,
        MAX_RENDER_DIMENSION / base.width,
        MAX_RENDER_DIMENSION / base.height,
        Math.sqrt(MAX_RENDER_PIXELS / (base.width * base.height)),
      );
      let viewport = page.getViewport({ scale });
      // Account for canvas rounding; never allocate beyond the budget.
      while (
        Math.ceil(viewport.width) > MAX_RENDER_DIMENSION ||
        Math.ceil(viewport.height) > MAX_RENDER_DIMENSION ||
        Math.ceil(viewport.width) * Math.ceil(viewport.height) >
          MAX_RENDER_PIXELS
      ) {
        scale *= 0.999;
        viewport = page.getViewport({ scale });
      }
      const png = await renderPageAsImage(pdf, i, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale,
      });
      imageBytes += png.byteLength;
      if (imageBytes > MAX_IMAGE_BYTES)
        throw new Error(
          "Rendered PDF images exceed the 32 MiB limit. Split it and upload the parts.",
        );
      files.push({
        data: Buffer.from(png).toString("base64"),
        mediaType: "image/png",
        filename: `${filename ?? "document"}-page-${i}.png`,
      });
      page.cleanup();
    }
    return {
      text:
        scannedPages.length < totalPages
          ? pages
              .map(
                (text, i) =>
                  `--- page ${i + 1} ---\n${scannedPages.includes(i + 1) ? "[scanned page, attached as an image]" : text}`,
              )
              .join("\n\n")
          : null,
      files,
      pageCount: totalPages,
    };
  } finally {
    await pdf.loadingTask.destroy();
  }
}

process.once("message", async ({ data, filename }) => {
  try {
    const result = await prepare(data, filename);
    process.send({ result });
  } catch (error) {
    process.send({
      error:
        error instanceof Error
          ? error.message
          : "This PDF could not be read. Upload an unlocked, valid PDF.",
    });
  }
});
