import { render } from "@react-email/render";
import { PasswordResetEmail } from "./password-reset";
import { VerifyEmail } from "./verify-email";

type RenderVerifyEmailInput = {
  name: string;
  verificationUrl: string;
};

type RenderPasswordResetEmailInput = {
  name: string;
  resetUrl: string;
};

export const renderVerifyEmail = async (input: RenderVerifyEmailInput) => {
  const component = <VerifyEmail {...input} />;

  return {
    html: await render(component),
    text: await render(component, { plainText: true }),
  };
};

export const renderPasswordResetEmail = async (
  input: RenderPasswordResetEmailInput,
) => {
  const component = <PasswordResetEmail {...input} />;

  return {
    html: await render(component),
    text: await render(component, { plainText: true }),
  };
};
