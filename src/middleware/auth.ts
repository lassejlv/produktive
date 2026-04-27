import { createMiddleware } from "hono/factory";
import { auth, createDefaultOrganizationForUser } from "../lib/auth";
import { prisma } from "../lib/prisma";

type AuthSession = typeof auth.$Infer.Session;

export type AuthEnv = {
  Variables: {
    session: AuthSession["session"];
    user: AuthSession["user"];
    organizationId: string;
  };
};

const getUserOrganizationId = async (
  userId: string,
  activeOrganizationId?: string | null,
) => {
  if (activeOrganizationId) {
    const activeMembership = await prisma.member.findFirst({
      where: {
        userId,
        organizationId: activeOrganizationId,
      },
      select: {
        organizationId: true,
      },
    });

    if (activeMembership) {
      return activeMembership.organizationId;
    }
  }

  const membership = await prisma.member.findFirst({
    where: {
      userId,
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

export const requireAuth = createMiddleware<AuthEnv>(async (c, next) => {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  let organizationId = await getUserOrganizationId(
    session.user.id,
    session.session.activeOrganizationId,
  );

  if (!organizationId) {
    organizationId = await createDefaultOrganizationForUser(session.user);
  }

  if (!organizationId) {
    return c.json({ error: "Unable to create organization" }, 500);
  }

  c.set("session", session.session);
  c.set("user", session.user);
  c.set("organizationId", organizationId);

  await next();
});
