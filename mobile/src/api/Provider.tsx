import React, { useEffect, useState } from "react";
import {
  QueryCache,
  QueryClient,
  QueryClientProvider,
  MutationCache,
} from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import superjson from "superjson";
import { api } from "./client";

/** Mount once per authenticated identity; never clear a newly subscribed cache. */
export function FinanceProvider({
  origin,
  auth,
  onUnauthorized,
  children,
}: React.PropsWithChildren<{
  origin: string;
  auth: { getCookie: () => string | Promise<string> };
  onUnauthorized: () => void;
}>) {
  const [cache] = useState(() => {
    const onError = (error: unknown) => {
      if (
        error instanceof TRPCClientError &&
        error.data?.code === "UNAUTHORIZED"
      )
        onUnauthorized();
    };
    return new QueryClient({
      queryCache: new QueryCache({ onError }),
      mutationCache: new MutationCache({ onError }),
      defaultOptions: {
        queries: { retry: 1, staleTime: 30_000 },
        mutations: { retry: false },
      },
    });
  });
  const [rpc] = useState(() =>
    api.createClient({
      links: [
        httpBatchLink({
          url: origin + "/api/trpc",
          transformer: superjson,
          methodOverride: "POST",
          headers: async () => ({
            cookie: await auth.getCookie(),
            "x-trpc-source": "expo",
          }),
          fetch: (url, options) =>
            fetch(url, { ...options, credentials: "omit" }),
        }),
      ],
    }),
  );
  useEffect(() => () => cache.clear(), [cache]);
  return (
    <QueryClientProvider client={cache}>
      <api.Provider client={rpc} queryClient={cache}>
        {children}
      </api.Provider>
    </QueryClientProvider>
  );
}
