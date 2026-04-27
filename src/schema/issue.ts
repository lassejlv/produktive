import { z } from "zod";

export const createIssueSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1).optional(),
  status: z.string().trim().min(1).default("backlog"),
  priority: z.string().trim().min(1).default("medium"),
  assignedToId: z.string().trim().min(1).nullable().optional(),
});

export const updateIssueSchema = createIssueSchema.partial();

export const issueIdSchema = z.object({
  id: z.string().trim().min(1),
});
