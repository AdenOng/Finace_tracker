// A preset permits 2M characters (up to 12MB when JSON-escaped). This also
// accommodates 500 snapshot positions and import edits of up to 1,000 row IDs.
export const MAX_TRPC_BODY_BYTES = 16 * 1024 * 1024;
export const MAX_TRPC_URL_BYTES = 32 * 1024;
export const MAX_TRPC_BATCH_SIZE = 20;

/** Bound bytes before handing the request to tRPC's JSON parser. */
export async function limitTRPCRequest(
  request: Request,
): Promise<Request | Response> {
  if (new TextEncoder().encode(request.url).byteLength > MAX_TRPC_URL_BYTES) {
    return new Response("Request URL too large", { status: 414 });
  }

  const declaredLength = request.headers.get("content-length");
  if (declaredLength !== null) {
    if (!/^\d+$/.test(declaredLength)) {
      return new Response("Invalid Content-Length", { status: 400 });
    }
    if (Number(declaredLength) > MAX_TRPC_BODY_BYTES) {
      void request.body?.cancel().catch(() => undefined);
      return new Response("Request body too large", { status: 413 });
    }
  }
  if (!request.body) return request;

  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_TRPC_BODY_BYTES) {
        void reader.cancel().catch(() => undefined);
        return new Response("Request body too large", { status: 413 });
      }
      chunks.push(value);
    }
  } catch {
    return new Response("Could not read request body", { status: 400 });
  } finally {
    reader.releaseLock();
  }

  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const headers = new Headers(request.headers);
  headers.delete("transfer-encoding");
  headers.set("content-length", String(size));
  return new Request(request.url, {
    method: request.method,
    headers,
    body,
    signal: request.signal,
  });
}

export const EXPENSIVE_REQUESTS_PER_MINUTE = 30;
/** Heavy page reads: generous enough for normal browsing, separate from mutations. */
export const EXPENSIVE_READS_PER_MINUTE = 120;
const WINDOW_MS = 60_000;
const MAX_TRACKED_USERS = 10_000;

/** Per-process sliding window per user. Expired users are pruned lazily. */
export function createExpensiveRequestLimiter(
  perMinute = EXPENSIVE_REQUESTS_PER_MINUTE,
) {
  const users = new Map<string, number[]>();
  let lastSweep = 0;
  return (userId: string, now = Date.now()): boolean => {
    if (now - lastSweep >= WINDOW_MS) {
      for (const [id, timestamps] of users) {
        if ((timestamps.at(-1) ?? 0) <= now - WINDOW_MS) users.delete(id);
      }
      lastSweep = now;
    }
    const recent = (users.get(userId) ?? []).filter(
      (timestamp) => timestamp > now - WINDOW_MS,
    );
    if (recent.length >= perMinute) return false;
    // Fail closed rather than let authenticated traffic grow the map indefinitely.
    if (!users.has(userId) && users.size >= MAX_TRACKED_USERS) return false;
    recent.push(now);
    users.set(userId, recent);
    return true;
  };
}

// Router tests drive one user through many calls; the limiter itself is tested via the factory.
export const consumeExpensiveRequest =
  process.env.NODE_ENV === "test"
    ? () => true
    : createExpensiveRequestLimiter();
export const consumeExpensiveRead =
  process.env.NODE_ENV === "test"
    ? () => true
    : createExpensiveRequestLimiter(EXPENSIVE_READS_PER_MINUTE);
