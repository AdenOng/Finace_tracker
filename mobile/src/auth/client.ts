import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client/plugins";
import { expoClient, storageAdapter } from "@better-auth/expo/client";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";
export async function createClient(origin: string) {
  const hash = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    origin,
  );
  const prefix = "finfolio_" + hash;
  const client = createAuthClient({
    baseURL: origin,
    plugins: [
      expoClient({
        scheme: "finfolio",
        storage: SecureStore,
        storagePrefix: prefix,
        disableCache: true,
      }),
      twoFactorClient(),
    ],
  });
  return { client, prefix, storage: storageAdapter(SecureStore) };
}
export type AuthBundle = Awaited<ReturnType<typeof createClient>>;
