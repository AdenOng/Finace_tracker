export const STATEMENT_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
];
export function statementType(
  name: string,
  type: string | undefined,
  size: number,
) {
  if (size <= 0 || size > 20 * 1024 * 1024)
    throw new Error("Choose a nonempty statement up to 20 MB.");
  const inferred: Record<string, string> = {
    pdf: "application/pdf",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    webp: "image/webp",
  };
  const mime =
    !type || type === "application/octet-stream"
      ? inferred[name.split(".").at(-1)?.toLowerCase() ?? ""]
      : type;
  if (!mime || !STATEMENT_TYPES.includes(mime))
    throw new Error("Choose a PDF, PNG, JPEG or WebP statement.");
  return mime;
}
export function reading(job: { status: string; stale: boolean }) {
  return !job.stale && (job.status === "queued" || job.status === "running");
}
