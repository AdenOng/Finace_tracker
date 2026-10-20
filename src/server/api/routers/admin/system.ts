import { TRPCError } from "@trpc/server";

import { adminProcedure, createTRPCRouter } from "~/server/api/trpc";
import { recordAudit } from "~/server/lib/audit";
import { trySendMail } from "~/server/lib/mailer";
import { systemInfo } from "~/server/modules/system-info";

export const adminSystemRouter = createTRPCRouter({
  info: adminProcedure.query(({ ctx }) => systemInfo(ctx.db)),

  /** Sends a test message to the signed-in admin, to check SMTP settings. */
  testEmail: adminProcedure.mutation(async ({ ctx }) => {
    const error = await trySendMail({
      to: ctx.session.user.email,
      subject: "Finfolio test email",
      text: "Email from Finfolio is working. Invites, reset links and new-device alerts can now be sent.",
    });
    if (error) throw new TRPCError({ code: "BAD_REQUEST", message: error });
    await recordAudit(ctx.db, {
      actorId: ctx.session.user.id,
      action: "settings.test_email_sent",
      targetType: "settings",
      targetLabel: ctx.session.user.email,
    });
    return { to: ctx.session.user.email };
  }),
});
