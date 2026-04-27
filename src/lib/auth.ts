import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { organization } from "better-auth/plugins";
import { prisma } from "./prisma";

const createDefaultOrganizationForUser = async (user: {
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
    return;
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
};

export const auth = betterAuth({
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),

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
