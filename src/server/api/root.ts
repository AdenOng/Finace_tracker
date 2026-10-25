import { transfersRouter } from "./routers/transfers";
import { workspacesRouter } from "./routers/workspaces";
import { createCallerFactory, createTRPCRouter } from "~/server/api/trpc";
import { accountsRouter } from "./routers/accounts";
import { adminRouter } from "./routers/admin";
import { catalogRouter } from "./routers/catalog";
import { portfolioRouter } from "./routers/portfolio";
import { settingsRouter } from "./routers/settings";
import { spendingRouter } from "./routers/spending";
import { merchantRulesRouter } from "./routers/merchant-rules";
import { passwordResetRouter } from "./routers/password-reset";
import { reconciliationRouter } from "./routers/reconciliation";
import { importsRouter } from "./routers/imports";

export const appRouter = createTRPCRouter({
  workspaces: workspacesRouter,
  catalog: catalogRouter,
  settings: settingsRouter,
  accounts: accountsRouter,
  portfolio: portfolioRouter,
  spending: spendingRouter,
  transfers: transfersRouter,
  merchantRules: merchantRulesRouter,
  reconciliation: reconciliationRouter,
  imports: importsRouter,
  admin: adminRouter,
  passwordReset: passwordResetRouter,
});

export type AppRouter = typeof appRouter;

export const createCaller = createCallerFactory(appRouter);
