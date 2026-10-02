import { createTRPCRouter } from "~/server/api/trpc";
import { adminAiRouter } from "./ai";
import { adminCategoriesRouter } from "./categories";
import { adminInstitutionsRouter } from "./institutions";
import { adminUsersRouter } from "./users";

export const adminRouter = createTRPCRouter({
  users: adminUsersRouter,
  institutions: adminInstitutionsRouter,
  categories: adminCategoriesRouter,
  ai: adminAiRouter,
});
