/** A successful probe identifies Finfolio and its database, without sending credentials. */
export async function checkConnection(origin: string, request = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const response = await request(origin + "/api/health", {
      credentials: "omit",
      signal: controller.signal,
    });
    if (response.status === 503)
      throw new Error(
        "Your server is running, but its database is unavailable. Contact your admin.",
      );
    if (!response.ok)
      throw new Error(
        "This server did not answer the Finfolio connection check. Check the address and backend version.",
      );
    const data = (await response.json().catch(() => null)) as {
      service?: string;
      status?: string;
    } | null;
    if (data?.service !== "finfolio" || data?.status !== "ok")
      throw new Error("This address did not return a healthy Finfolio server.");
  } catch (error) {
    if (error instanceof TypeError || controller.signal.aborted)
      throw new Error(
        "Cannot reach your server. Check the address, internet connection, and that Finfolio is running.",
      );
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

export function accessError(error: {
  message: string;
  data?: { code?: string } | null;
}) {
  const code = error.data?.code;
  if (code === "UNAUTHORIZED")
    return {
      title: "Sign in again",
      detail: "Your session has ended. Sign in to continue.",
      enrollment: false,
    };
  if (code === "FORBIDDEN" && /two.factor|enroll/i.test(error.message))
    return {
      title: "Set up two-step sign-in",
      detail: "Complete security setup in web Settings, then try again.",
      enrollment: true,
    };
  if (!code)
    return {
      title: "Cannot reach your server",
      detail:
        "Check your connection and that Finfolio is running, then try again.",
      enrollment: false,
    };
  return {
    title: "Couldn’t load your finances",
    detail: error.message,
    enrollment: false,
  };
}
