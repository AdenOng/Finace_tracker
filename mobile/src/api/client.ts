import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "../../../src/server/api/root";
export const api = createTRPCReact<AppRouter>();
