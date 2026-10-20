import { env } from "~/env";
import {
  cachedInstanceSettings,
  type TwoFactorPolicy,
} from "~/server/lib/instance-settings-cache";

/**
 * Who must use two-step verification. REQUIRE_TWO_FACTOR=true is a deployment-level floor that
 * the admin console cannot lower; otherwise Admin → Security decides.
 */
export function twoFactorPolicy(): {
  policy: TwoFactorPolicy;
  forcedByEnv: boolean;
} {
  if (env.REQUIRE_TWO_FACTOR) return { policy: "everyone", forcedByEnv: true };
  const policy = cachedInstanceSettings().twoFactorPolicy;
  return {
    policy: policy === "everyone" || policy === "admins" ? policy : "off",
    forcedByEnv: false,
  };
}

/** True when the policy demands 2FA from this user and they have not enrolled yet. */
export function needsTwoFactorEnrollment(user: {
  twoFactorEnabled?: boolean | null;
  role?: string | null;
}) {
  if (user.twoFactorEnabled) return false;
  const { policy } = twoFactorPolicy();
  return (
    policy === "everyone" || (policy === "admins" && user.role === "admin")
  );
}
