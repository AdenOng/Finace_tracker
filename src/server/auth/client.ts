import { passkeyClient } from "@better-auth/passkey/client";
import { adminClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

import { safeNextPath } from "~/lib/navigation";

export const authClient = createAuthClient({
  plugins: [
    adminClient(),
    twoFactorClient({
      onTwoFactorRedirect() {
        const next = safeNextPath(
          new URL(window.location.href).searchParams.get("next"),
        );
        window.location.href = `/two-factor?next=${encodeURIComponent(next)}`;
      },
    }),
    passkeyClient(),
  ],
});

export type ClientSession = typeof authClient.$Infer.Session;
