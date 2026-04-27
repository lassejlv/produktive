import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import {
  renderPasswordResetEmail,
  renderVerifyEmail,
} from "../emails/auth";
import { prisma } from "./prisma";
import { sendEmail } from "./resend";
import { env } from "./env";

export const createDefaultOrganizationForUser = async (user: {
  id: string;
  name?: string | null;
  email?: string | null;
}) => {
  const existingMemberships = await prisma.member.count({
    where: {
      userId: user.id,
    },
  });

  if (existingMemberships > 0) {
    const membership = await prisma.member.findFirst({
      where: {
        userId: user.id,
      },
      orderBy: {
        createdAt: "asc",
      },
      select: {
        organizationId: true,
      },
    });

    return membership?.organizationId ?? null;
  }

  const name = user.name?.trim() || "Personal Organization";
  const slugBase = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  const slug = `${slugBase || "personal"}-${user.id.slice(0, 8)}`;

  await auth.api.createOrganization({
    body: {
      name,
      slug,
      userId: user.id,
    },
  });

  const membership = await prisma.member.findFirst({
    where: {
      userId: user.id,
    },
    orderBy: {
      createdAt: "asc",
    },
    select: {
      organizationId: true,
    },
  });

  return membership?.organizationId ?? null;
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  trustedOrigins: env.CORS_ORIGINS,
  advanced: {
    useSecureCookies: Boolean(env.AUTH_COOKIE_DOMAIN),
    crossSubDomainCookies: {
      enabled: Boolean(env.AUTH_COOKIE_DOMAIN),
      domain: env.AUTH_COOKIE_DOMAIN || undefined,
    },
    defaultCookieAttributes: env.AUTH_COOKIE_DOMAIN
      ? {
          sameSite: "none",
          secure: true,
        }
      : undefined,
  },

  emailAndPassword: {
    enabled: true,
    requireEmailVerification: true,
    minPasswordLength: 8,
    resetPasswordTokenExpiresIn: 60 * 60,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      const email = await renderPasswordResetEmail({
        name: user.name,
        resetUrl: url,
      });

      await sendEmail({
        to: user.email,
        subject: "Reset your Produktive password",
        ...email,
      });
    },
  },

  emailVerification: {
    sendOnSignUp: true,
    sendVerificationEmail: async ({ user, url }) => {
      const email = await renderVerifyEmail({
        name: user.name,
        verificationUrl: url,
      });

      await sendEmail({
        to: user.email,
        subject: "Verify your Produktive email",
        ...email,
      });
    },
  },

  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          await createDefaultOrganizationForUser(user);
        },
      },
    },
  },

  plugins: [organization()],
});
