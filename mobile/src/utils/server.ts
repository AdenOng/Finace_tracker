/** Require a bare origin so auth and RPC always share one trusted server. */
export function normalizeServer(input: string, development = false): string {
  const raw = input.trim();
  // People often type just the host ("finance.example.com" or "10.0.2.2:3000").
  const schemeGiven = /^[a-z][a-z\d+.-]*:\/\//i.test(raw);
  let url: URL;
  try {
    url = new URL(schemeGiven ? raw : "https://" + raw);
  } catch {
    throw new Error(
      "That doesn't look like a server address. Enter it like https://finance.example.com",
    );
  }
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.pathname !== "/" && url.pathname !== "")
  ) {
    throw new Error(
      "Enter only the server origin, for example https://finance.example.com",
    );
  }
  const host = url.hostname.toLowerCase();
  const local =
    host === "localhost" ||
    host === "10.0.2.2" ||
    host === "127.0.0.1" ||
    /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^192\.168\.\d{1,3}\.\d{1,3}$/.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}$/.test(host);
  // A bare local address in a development build is almost always a plain-HTTP dev server.
  if (!schemeGiven && development && local) url.protocol = "http:";
  if (
    url.protocol !== "https:" &&
    !(development && local && url.protocol === "http:")
  ) {
    throw new Error(
      "Use HTTPS. Development builds also allow HTTP on a local network.",
    );
  }
  return url.origin;
}
export function shiftMonth(month: string, delta: number) {
  const [year, part] = month.split("-").map(Number);
  const date = new Date(Date.UTC(year!, part! - 1 + delta, 1));
  return date.toISOString().slice(0, 7);
}
export function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function validDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(value + "T12:00:00");
  return Number.isFinite(parsed.getTime()) &&
    `${parsed.getFullYear()}-${String(parsed.getMonth() + 1).padStart(2, "0")}-${String(parsed.getDate()).padStart(2, "0")}` === value;
}
