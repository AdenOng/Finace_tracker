import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const VERSION = "v1";

/** A canonical 32-byte base64 key, as produced by `openssl rand -base64 32`. */
export function decodeEncryptionKey(material: string): Buffer {
  const decoded = Buffer.from(material, "base64");
  if (decoded.length !== 32 || decoded.toString("base64") !== material) {
    throw new Error(
      "APP_ENCRYPTION_KEY must be 32 random bytes encoded as base64",
    );
  }
  return decoded;
}

/** Versioned AES-256-GCM envelope. The IV is fresh for every stored secret. */
export function encryptSecretValue(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  return [VERSION, iv, cipher.getAuthTag(), ciphertext]
    .map((part) =>
      typeof part === "string" ? part : part.toString("base64url"),
    )
    .join(".");
}

export function decryptSecretValue(payload: string, key: Buffer): string {
  const parts = payload.split(".");
  const [version, encodedIv, encodedTag, ciphertext] = parts;
  if (
    parts.length !== 4 ||
    version !== VERSION ||
    !encodedIv ||
    !encodedTag ||
    ciphertext === undefined
  ) {
    throw new Error("Unsupported secret format");
  }
  const iv = Buffer.from(encodedIv, "base64url");
  const tag = Buffer.from(encodedTag, "base64url");
  if (iv.length !== 12 || tag.length !== 16) {
    throw new Error("Invalid secret envelope");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
}

/** A display hint only; short credentials are never partially revealed. */
export function maskSecret(plaintext: string): string {
  if (plaintext.length <= 8) return "••••";
  return `${plaintext.slice(0, 3)}…${plaintext.slice(-4)}`;
}
