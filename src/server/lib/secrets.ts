import "server-only";

import { env } from "~/env";
import {
  decodeEncryptionKey,
  decryptSecretValue,
  encryptSecretValue,
} from "./secret-codec";

export { maskSecret } from "./secret-codec";

/** Keep environment-bound encryption on the server; never use a shared fallback key. */
export function encryptSecret(plaintext: string): string {
  return encryptSecretValue(
    plaintext,
    decodeEncryptionKey(env.APP_ENCRYPTION_KEY),
  );
}

export function decryptSecret(payload: string): string {
  return decryptSecretValue(
    payload,
    decodeEncryptionKey(env.APP_ENCRYPTION_KEY),
  );
}
