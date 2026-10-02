/**
 * tRPC setup: context, error formatting and the procedure types used by routers —
 * `publicProcedure`, `enrollingProcedure` (signed in, 2FA enrolment may still be pending),
 * `protectedProcedure` (signed in and enrolled, carries an access scope) and `adminProcedure`
 * (protected, with the admin role).
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError, z } from "zod";

import { auth } from "~/server/auth/config";
import { needsTwoFactorEnrollment } from "~/server/auth/enrollment";
import { db } from "~/server/db";
import { resolveAccessScope } from "~/server/lib/access";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({
    headers: opts.headers,
  });
  return {
    db,
    session,
    ...opts,
  };
};

const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      message:
        error.code === "INTERNAL_SERVER_ERROR"
          ? "The request could not be completed."
          : shape.message,
      data: {
        ...shape.data,
        ...(error.code === "INTERNAL_SERVER_ERROR" ? { stack: undefined } : {}),
        zodError:
          error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;

const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  const result = await next();
  if (t._config.isDev) {
    console.log(`[TRPC] ${path} took ${Date.now() - start}ms`);
  }
  return result;
});

export const publicProcedure = t.procedure.use(timingMiddleware);

/**
 * Signed in, but not necessarily 2FA-enrolled. Only for what the Settings page needs while a user
 * is being held there to enrol; everything else uses `protectedProcedure`.
 */
export const enrollingProcedure = t.procedure
  .use(timingMiddleware)
  .use(({ ctx, next }) => {
    if (!ctx.session?.user) {
      throw new TRPCError({ code: "UNAUTHORIZED" });
    }
    return next({
      ctx: {
        session: { ...ctx.session, user: ctx.session.user },
        scope: resolveAccessScope(ctx.session.user.id),
      },
    });
  });

/** Signed in and, on instances with REQUIRE_TWO_FACTOR, enrolled in 2FA. */
export const protectedProcedure = enrollingProcedure.use(({ ctx, next }) => {
  if (needsTwoFactorEnrollment(ctx.session.user)) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Set up two-factor authentication to continue.",
    });
  }
  return next();
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.session.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});
