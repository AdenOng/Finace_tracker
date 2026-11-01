import { fork } from "node:child_process";
import path from "node:path";

import type { LlmFile } from "../llm";

export const SUPPORTED_MIME_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const;

/** Keep the scanned-page limit in sync with the standalone pdf-worker.mjs. */
export const MAX_IMAGE_PAGES = 15;
export const PDF_TIMEOUT_MS = 30_000;

export type PreparedInput = {
  /** Text layer of the pages that have a usable one. Cheaper and more accurate than vision. */
  text: string | null;
  /** Images for vision models: uploaded images, or rendered scanned pages of a PDF. */
  files: LlmFile[];
  pageCount: number | null;
};

export class UnreadableDocumentError extends Error {}

/** The file needs a model that reads images; another provider may still manage it. */
export class NeedsVisionError extends UnreadableDocumentError {}

/**
 * Resolved at runtime from the working directory. Built from parts so Turbopack's dev
 * server does not try to resolve the worker as a module (it fails on a literal path).
 */
function workerPath() {
  const parts = [process.cwd()];
  parts.push("src", "server", "modules", "extraction", "pdf-worker.mjs");
  return path.join(...parts);
}

/**
 * Most vision models accept images but not PDFs, so scanned PDF pages are rendered to PNG here
 * rather than passed through as files. Coverage is judged per page: a mixed PDF sends its text
 * pages as text and only its scanned pages as images.
 */
export async function prepareDocumentInput(
  data: Uint8Array,
  mediaType: string,
  filename?: string,
  signal?: AbortSignal,
): Promise<PreparedInput> {
  signal?.throwIfAborted();
  if (mediaType !== "application/pdf") {
    return {
      text: null,
      files: [{ data, mediaType, filename }],
      pageCount: null,
    };
  }

  // Run the worker on the current runtime so it never depends on PATH. In production (Node)
  // the heap flags cap it; Bun ignores V8 flags, so tests rely on the deadline and pixel budget.
  // The raw ESM worker is traced into the standalone output.
  return new Promise<PreparedInput>((resolve, reject) => {
    const child = fork(workerPath(), [], {
      execPath: process.execPath,
      execArgv: process.versions.bun
        ? []
        : ["--max-old-space-size=256", "--max-semi-space-size=16"],
      stdio: ["ignore", "ignore", "ignore", "ipc"],
    });
    let settled = false;
    const finish = (error?: Error, result?: PreparedInput) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      signal?.removeEventListener("abort", onAbort);
      child.kill("SIGKILL");
      if (error) reject(error);
      else resolve(result!);
    };
    const onAbort = () => {
      const reason: unknown = signal?.reason;
      finish(
        reason instanceof Error
          ? reason
          : new DOMException("Aborted", "AbortError"),
      );
    };
    const deadline = setTimeout(
      () =>
        finish(
          new UnreadableDocumentError(
            "PDF processing exceeded the 30 second limit. Split it and upload the parts.",
          ),
        ),
      PDF_TIMEOUT_MS,
    );
    child.once("error", () =>
      finish(new UnreadableDocumentError("PDF processing could not start.")),
    );
    child.once("exit", () =>
      finish(
        new UnreadableDocumentError(
          "PDF processing exceeded its memory limit or stopped unexpectedly.",
        ),
      ),
    );
    child.once(
      "message",
      (message: {
        error?: string;
        result?: Omit<PreparedInput, "files"> & {
          files: { data: string; mediaType: string; filename: string }[];
        };
      }) => {
        if (message.error || !message.result) {
          finish(
            new UnreadableDocumentError(
              message.error ?? "This PDF could not be read.",
            ),
          );
          return;
        }
        const result = message.result;
        finish(undefined, {
          ...result,
          files: result.files.map((file) => ({
            ...file,
            data: new Uint8Array(Buffer.from(file.data, "base64")),
          })),
        });
      },
    );
    signal?.addEventListener("abort", onAbort, { once: true });
    if (signal?.aborted) {
      onAbort();
      return;
    }
    child.send(
      { data: Buffer.from(data).toString("base64"), filename },
      (error) => {
        if (error)
          finish(
            new UnreadableDocumentError("PDF processing could not start."),
          );
      },
    );
  });
}
