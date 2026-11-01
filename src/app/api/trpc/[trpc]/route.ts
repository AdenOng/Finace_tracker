import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { type NextRequest } from "next/server";

import { env } from "~/env";
import { appRouter } from "~/server/api/root";
import { createTRPCContext } from "~/server/api/trpc";
import {
  limitTRPCRequest,
  MAX_TRPC_BATCH_SIZE,
} from "~/server/lib/request-limits";

/**
 * This wraps the `createTRPCContext` helper and provides the required context for the tRPC API when
 * handling a HTTP request (e.g. when you make requests from Client Components).
 */
const createContext = async (req: NextRequest) => {
  return createTRPCContext({
    headers: req.headers,
  });
};

const handler = async (req: NextRequest) => {
  const limited = await limitTRPCRequest(req);
  if (limited instanceof Response) return limited;
  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req: limited,
    router: appRouter,
    allowMethodOverride: true,
    maxBatchSize: MAX_TRPC_BATCH_SIZE,
    createContext: () => createContext(req),
    onError:
      env.NODE_ENV === "development"
        ? ({ path, error }) => {
            console.error(
              `tRPC failed on ${path ?? "<no-path>"}: ${error.code}`,
            );
          }
        : undefined,
  });
};

export { handler as GET, handler as POST };
