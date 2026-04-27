import { Resend } from "resend";
import { env } from "./env";

export const resend = new Resend(env.RESEND_API_KEY);

export const resendFromEmail = env.RESEND_FROM_EMAIL;

type SendEmailInput = {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  from?: string;
};

export const sendEmail = async ({
  from = resendFromEmail,
  ...email
}: SendEmailInput) => {
  const { data, error } = await resend.emails.send({
    from,
    ...email,
  });

  if (error) {
    throw new Error(error.message);
  }

  return data;
};
