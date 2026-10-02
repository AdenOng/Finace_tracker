import { extractText, getDocumentProxy, renderPageAsImage } from "unpdf";

import type { LlmFile } from "../llm";

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** A page with fewer characters than this in its text layer is treated as scanned. */
const MIN_TEXT_CHARS_PER_PAGE = 80;
/** Scanned pages are rasterised one by one; cap it so one upload cannot run up a huge bill. */
export const MAX_IMAGE_PAGES = 15;
/** ~150 DPI for A4/Letter — legible for vision models without oversized images. */
const RENDER_SCALE = 2;

export type PreparedInput = {
  /** Text layer of the pages that have a usable one. Cheaper and more accurate than vision. */
  text: string | null;
  /** Images for vision models: uploaded images, or rendered scanned pages of a PDF. */
  files: LlmFile[];
  pageCount: number | null;
};

export class UnreadableDocumentError extends Error {}

/**
 * Most vision models accept images but not PDFs, so scanned PDF pages are rendered to PNG here
 * rather than passed through as files. Coverage is judged per page: a mixed PDF sends its text
 * pages as text and only its scanned pages as images.
 */
export async function prepareDocumentInput(
  data: Uint8Array,
  mediaType: string,
  filename?: string,
): Promise<PreparedInput> {
  if (mediaType !== "application/pdf") {
    return {
      text: null,
      files: [{ data, mediaType, filename }],
      pageCount: null,
    };
  }

  // pdf.js may detach the buffer it is given, so hand it a copy.
  const pdf = await getDocumentProxy(data.slice()).catch(() => {
    throw new UnreadableDocumentError(
      "This PDF could not be read. Upload an unlocked, valid PDF.",
    );
  });
  try {
    const { totalPages, text } = await extractText(pdf, { mergePages: false });
    const pages = Array.from(
      { length: totalPages },
      (_, i) => text[i]?.trim() ?? "",
    );
    const scannedPages = pages.flatMap((page, i) =>
      page.length < MIN_TEXT_CHARS_PER_PAGE ? [i + 1] : [],
    );

    if (scannedPages.length > MAX_IMAGE_PAGES) {
      throw new UnreadableDocumentError(
        `This PDF has ${scannedPages.length} scanned pages (no text layer); the limit is ${MAX_IMAGE_PAGES}. Split it and upload the parts.`,
      );
    }

    const files: LlmFile[] = [];
    for (const page of scannedPages) {
      const png = await renderPageAsImage(pdf, page, {
        canvasImport: () => import("@napi-rs/canvas"),
        scale: RENDER_SCALE,
      });
      files.push({
        data: new Uint8Array(png),
        mediaType: "image/png",
        filename: `${filename ?? "document"}-page-${page}.png`,
      });
    }

    const hasText = scannedPages.length < totalPages;
    return {
      text: hasText
        ? pages
            .map(
              (page, i) =>
                `--- page ${i + 1} ---\n${
                  scannedPages.includes(i + 1)
                    ? "[scanned page, attached as an image]"
                    : page
                }`,
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
