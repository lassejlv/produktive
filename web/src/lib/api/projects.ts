import {
  CreateProjectDocument,
  DeleteProjectDocument,
  ProjectDocument,
  ProjectsDocument,
  UpdateProjectDocument,
} from "@/gql/graphql";
import { graphqlRequest, unwrapGraphQLJson } from "@/lib/api/graphql/client";
import type { ActorProfile } from "./actor-profile";

export type ProjectSummary = {
  id: string;
  name: string;
  color: string;
  icon: string | null;
};

export type ProjectLead = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type ProjectStatusBreakdown = {
  backlog: number;
  todo: number;
  inProgress: number;
  done: number;
};

export type Project = {
  id: string;
  name: string;
  description: string | null;
  status: string;
  color: string;
  icon: string | null;
  leadId: string | null;
  lead: ProjectLead | null;
  createdByProfile?: ActorProfile | null;
  targetDate: string | null;
  sortOrder: number;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  issueCount: number;
  doneCount: number;
  statusBreakdown: ProjectStatusBreakdown;
};

export type CreateProjectInput = {
  name: string;
  description?: string;
  status?: string;
  color?: string;
  icon?: string | null;
  leadId?: string | null;
  targetDate?: string | null;
};

export type UpdateProjectInput = Partial<CreateProjectInput> & {
  archived?: boolean;
};

export const listProjects = (includeArchived = false) =>
  graphqlRequest(ProjectsDocument, { includeArchived }).then((data) =>
    unwrapGraphQLJson<{ projects: Project[] }>(data.projects),
  );

export const getProject = (id: string) =>
  graphqlRequest(ProjectDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ project: Project }>(data.project),
  );

export const createProject = (input: CreateProjectInput) =>
  graphqlRequest(CreateProjectDocument, { input }).then((data) =>
    unwrapGraphQLJson<{ project: Project }>(data.createProject),
  );

export const updateProject = (id: string, patch: UpdateProjectInput) =>
  graphqlRequest(UpdateProjectDocument, { id, input: patch }).then((data) =>
    unwrapGraphQLJson<{ project: Project }>(data.updateProject),
  );

export const deleteProject = (id: string) =>
  graphqlRequest(DeleteProjectDocument, { id }).then(() => undefined as void);
