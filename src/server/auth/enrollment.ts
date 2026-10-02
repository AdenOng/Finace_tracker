import { env } from "~/env";

/** True when the deployment demands 2FA and this user has not enrolled yet. */
export function needsTwoFactorEnrollment(user: {
  twoFactorEnabled?: boolean | null;
}) {
  return env.REQUIRE_TWO_FACTOR && !user.twoFactorEnabled;
}
