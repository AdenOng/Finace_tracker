import { z } from "zod";

import { SUPPORTED_MIME_TYPES } from "./prepare-input";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;
// Account for multipart headers and text fields, without allowing an unbounded request body.
export const MAX_REQUEST_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024;

export class UploadValidationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "UploadValidationError";
  }
}

const optionalId = z
  .uuid()
  .nullable()
  .optional()
  .or(z.literal("").transform(() => undefined));
const fieldsSchema = z.object({
  providerId: optionalId,
  institutionId: optionalId,
  model: z.string().trim().max(200).nullable().optional(),
});

async function readLimitedBody(
  request: Request,
): Promise<Uint8Array<ArrayBuffer>> {
  const size = Number(request.headers.get("content-length"));
  if (size > MAX_REQUEST_BYTES) {
    throw new UploadValidationError("Upload request is too large", 413);
  }
  if (!request.body) throw new UploadValidationError("Attach a file");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > MAX_REQUEST_BYTES) {
        await reader.cancel();
        throw new UploadValidationError("Upload request is too large", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Validate transport and field types before any database or provider work. */
export async function parseExtractionUpload(request: Request) {
  const headers = new Headers(request.headers);
  const body = await readLimitedBody(request);
  let form: FormData;
  try {
    form = await new Response(body, { headers }).formData();
  } catch {
    throw new UploadValidationError("Use a valid multipart upload");
  }
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    throw new UploadValidationError("Attach a non-empty file");
  }
  if (!(SUPPORTED_MIME_TYPES as readonly string[]).includes(file.type)) {
    throw new UploadValidationError(
      "Unsupported file type. Use PDF, PNG, JPEG or WebP.",
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new UploadValidationError("File is larger than 20 MB", 413);
  }
  const fields = fieldsSchema.safeParse({
    providerId: form.get("providerId"),
    institutionId: form.get("institutionId"),
    model: form.get("model"),
  });
  if (!fields.success) {
    throw new UploadValidationError(
      "Invalid provider, institution or model selection",
    );
  }
  return {
    file,
    ...fields.data,
    model:
      fields.data.model === "" ? undefined : (fields.data.model ?? undefined),
  };
}
