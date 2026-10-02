import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { adminRouter } from "./routers/admin";
import { catalogRouter } from "./routers/catalog";
import { settingsRouter } from "./routers/settings";

export const appRouter = createTRPCRouter({
  catalog: catalogRouter,
  settings: settingsRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
