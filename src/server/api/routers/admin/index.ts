import { createTRPCRouter } from "~/server/api/trpc";
import { adminAiRouter } from "./ai";
import { adminAuditRouter } from "./audit";
import { adminCategoriesRouter } from "./categories";
import { adminInstitutionsRouter } from "./institutions";
import { adminOverviewRouter } from "./overview";
import { adminUsersRouter } from "./users";

export const adminRouter = createTRPCRouter({
  overview: adminOverviewRouter,
  audit: adminAuditRouter,
  users: adminUsersRouter,
  institutions: adminInstitutionsRouter,
  categories: adminCategoriesRouter,
  ai: adminAiRouter,
});
