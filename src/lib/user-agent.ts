/** Short "Chrome on macOS" label for a user agent; keep the raw string for tooltips. */
export function describeUserAgent(userAgent: string | null | undefined) {
  if (!userAgent) return "Unknown device";
  const browser =
    [
      ["Edg/", "Edge"],
      ["Firefox/", "Firefox"],
      ["Chrome/", "Chrome"],
      ["Safari/", "Safari"],
    ].find(([needle]) => userAgent.includes(needle!))?.[1] ?? "Browser";
  const os =
    [
      ["iPhone", "iPhone"],
      ["iPad", "iPad"],
      ["Android", "Android"],
      ["Windows", "Windows"],
      ["Mac OS", "macOS"],
      ["Linux", "Linux"],
    ].find(([needle]) => userAgent.includes(needle!))?.[1] ?? null;
  return os ? `${browser} on ${os}` : browser;
}

/** How a session was signed in to, from its recorded sign-in event. */
export const sessionMethodLabels: Record<string, string> = {
  password: "Password",
  two_factor: "Password + two-step",
  backup_code: "Backup code",
  passkey: "Passkey",
};
