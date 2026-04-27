import { Hono } from "hono";
import { prisma } from "../lib/prisma";
import { type AuthEnv, requireAuth } from "../middleware/auth";
import {
  createIssueSchema,
  issueIdSchema,
  updateIssueSchema,
} from "../schema/issue";

export const issueRoutes = new Hono<AuthEnv>();

issueRoutes.use("*", requireAuth);

const isOrganizationMember = async (organizationId: string, userId: string) => {
  const member = await prisma.member.findFirst({
    where: {
      organizationId,
      userId,
    },
    select: {
      id: true,
    },
  });

  return Boolean(member);
};

issueRoutes.get("/", async (c) => {
  const organizationId = c.var.organizationId;
  const status = c.req.query("status");

  const issues = await prisma.issue.findMany({
    where: {
      organizationId,
      ...(status ? { status } : {}),
    },
    orderBy: {
      createdAt: "desc",
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  return c.json({ issues });
});

issueRoutes.post("/", async (c) => {
  const organizationId = c.var.organizationId;
  const user = c.var.user;
  const body = createIssueSchema.parse(await c.req.json());

  if (
    body.assignedToId &&
    !(await isOrganizationMember(organizationId, body.assignedToId))
  ) {
    return c.json({ error: "Assignee is not a member of this organization" }, 400);
  }

  const issue = await prisma.issue.create({
    data: {
      id: crypto.randomUUID(),
      organizationId,
      title: body.title,
      description: body.description,
      status: body.status,
      priority: body.priority,
      createdById: user.id,
      assignedToId: body.assignedToId,
    },
  });

  return c.json({ issue }, 201);
});

issueRoutes.get("/:id", async (c) => {
  const organizationId = c.var.organizationId;
  const { id } = issueIdSchema.parse(c.req.param());

  const issue = await prisma.issue.findFirst({
    where: {
      id,
      organizationId,
    },
    include: {
      createdBy: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
      assignedTo: {
        select: {
          id: true,
          name: true,
          email: true,
          image: true,
        },
      },
    },
  });

  if (!issue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  return c.json({ issue });
});

issueRoutes.patch("/:id", async (c) => {
  const organizationId = c.var.organizationId;
  const { id } = issueIdSchema.parse(c.req.param());
  const body = updateIssueSchema.parse(await c.req.json());

  if (
    body.assignedToId &&
    !(await isOrganizationMember(organizationId, body.assignedToId))
  ) {
    return c.json({ error: "Assignee is not a member of this organization" }, 400);
  }

  const existingIssue = await prisma.issue.findFirst({
    where: {
      id,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  if (!existingIssue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  const issue = await prisma.issue.update({
    where: {
      id,
    },
    data: body,
  });

  return c.json({ issue });
});

issueRoutes.delete("/:id", async (c) => {
  const organizationId = c.var.organizationId;
  const { id } = issueIdSchema.parse(c.req.param());

  const existingIssue = await prisma.issue.findFirst({
    where: {
      id,
      organizationId,
    },
    select: {
      id: true,
    },
  });

  if (!existingIssue) {
    return c.json({ error: "Issue not found" }, 404);
  }

  await prisma.issue.delete({
    where: {
      id,
    },
  });

  return c.json({ ok: true });
});
