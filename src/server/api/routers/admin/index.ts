import { createTRPCRouter } from "~/server/api/trpc";
import { adminAiRouter } from "./ai";
import { adminAuditRouter } from "./audit";
import { adminCategoriesRouter } from "./categories";
import { adminDataRouter } from "./data";
import { adminInstitutionsRouter } from "./institutions";
import { adminJobsRouter } from "./jobs";
import { adminOverviewRouter } from "./overview";
import { adminSecurityRouter } from "./security";
import { adminSystemRouter } from "./system";
import { adminUsersRouter } from "./users";

export const adminRouter = createTRPCRouter({
  overview: adminOverviewRouter,
  audit: adminAuditRouter,
  users: adminUsersRouter,
  security: adminSecurityRouter,
  jobs: adminJobsRouter,
  institutions: adminInstitutionsRouter,
  categories: adminCategoriesRouter,
  ai: adminAiRouter,
  data: adminDataRouter,
  system: adminSystemRouter,
});
