import "server-only";

import { createTransport, type Transporter } from "nodemailer";

import { env } from "~/env";

let transport: Transporter | undefined;

/** Outgoing email is optional; without SMTP_URL every link is handed over by the admin. */
export function isEmailConfigured() {
  return !!env.SMTP_URL && !!env.SMTP_FROM;
}

export class EmailNotConfiguredError extends Error {
  constructor() {
    super("Email is not set up. Add SMTP_URL and SMTP_FROM to .env.");
  }
}

export async function sendMail(message: {
  to: string;
  subject: string;
  text: string;
}) {
  if (!isEmailConfigured()) throw new EmailNotConfiguredError();
  transport ??= createTransport(env.SMTP_URL);
  await transport.sendMail({ from: env.SMTP_FROM, ...message });
}

/** Sends without throwing; returns an error message for the admin, or null when it went out. */
export async function trySendMail(message: Parameters<typeof sendMail>[0]) {
  try {
    await sendMail(message);
    return null;
  } catch (error) {
    console.error("[mail] send failed", error);
    return error instanceof EmailNotConfiguredError
      ? error.message
      : "The email could not be sent. Check SMTP settings on Admin → System.";
  }
}
