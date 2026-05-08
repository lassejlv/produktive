import {
  CreateIssueDocument,
  CreateIssueStatusDocument,
  DeleteIssueDocument,
  DeleteIssueStatusDocument,
  IssueDocument,
  IssueStatusesDocument,
  IssuesDocument,
  ReorderIssueStatusesDocument,
  UpdateIssueDocument,
  UpdateIssueStatusDocument,
} from "@/gql/graphql";
import { graphqlRequest, unwrapGraphQLJson } from "@/lib/graphql/client";
import { apiPath, internalGraphQLGet, internalGraphQLMutation } from "./client";
import type { LabelSummary } from "./labels";
import type { ProjectSummary } from "./projects";
import type { ActorProfile } from "./actor-profile";

export type Issue = {
  id: string;
  title: string;
  description: string | null;
  status: string;
  priority: string;
  createdAt: string;
  updatedAt: string;
  createdBy?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  createdByProfile?: ActorProfile | null;
  assignedTo?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  parentId?: string | null;
  projectId?: string | null;
  project?: ProjectSummary | null;
  labels?: LabelSummary[];
  attachments: IssueAttachment[];
};

export type IssueStatusCategory = "backlog" | "active" | "done" | "canceled";

export type IssueStatus = {
  id: string;
  key: string;
  name: string;
  color: string;
  category: IssueStatusCategory;
  sortOrder: number;
  isSystem: boolean;
  archived: boolean;
};

export type IssueAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  key: string;
  url: string;
  createdAt: string;
};

export type IssueHistoryChange = {
  field: string;
  before: unknown;
  after: unknown;
};

export type IssueHistoryEvent = {
  id: string;
  action: "created" | "updated" | "attachment_added" | string;
  changes: IssueHistoryChange[];
  createdAt: string;
  actor?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  actorProfile?: ActorProfile | null;
};

export type IssueComment = {
  id: string;
  body: string;
  createdAt: string;
  updatedAt: string;
  author?: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  authorProfile?: ActorProfile | null;
};

export type IssueSubscriberUser = {
  id: string;
  name: string;
  email: string;
  image: string | null;
};

export type IssueSubscribersResponse = {
  subscribers: IssueSubscriberUser[];
  subscribed: boolean;
};

export type IssuesPage = {
  issues: Issue[];
  nextCursor: string | null;
  hasMore: boolean;
};

type CreateIssueInput = {
  title: string;
  description?: string;
  status?: string;
  priority?: string;
  assignedToId?: string | null;
  parentId?: string | null;
  projectId?: string | null;
  labelIds?: string[];
};

type UpdateIssueInput = Partial<CreateIssueInput> & {
  assignedToId?: string | null;
  projectId?: string | null;
  labelIds?: string[];
};

export const listIssues = (limit: number, cursor: string | null) =>
  graphqlRequest(IssuesDocument, { limit, cursor }).then((data) =>
    unwrapGraphQLJson<IssuesPage>(data.issues),
  );

export const getIssue = (id: string) =>
  graphqlRequest(IssueDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ issue: Issue }>(data.issue),
  );

export const createIssue = (input: CreateIssueInput) =>
  graphqlRequest(CreateIssueDocument, { input }).then((data) =>
    unwrapGraphQLJson<{ issue: Issue }>(data.createIssue),
  );

export const updateIssue = (id: string, input: UpdateIssueInput) =>
  graphqlRequest(UpdateIssueDocument, { id, input }).then((data) =>
    unwrapGraphQLJson<{ issue: Issue }>(data.updateIssue),
  );

export const deleteIssue = (id: string) =>
  graphqlRequest(DeleteIssueDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ ok: true }>(data.deleteIssue),
  );

export const uploadIssueAttachment = async (id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(apiPath(`/api/issues/${id}/attachments`), {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Failed to upload attachment");
  }

  return response.json() as Promise<{ issue: Issue }>;
};

export const listIssueStatuses = () =>
  graphqlRequest(IssueStatusesDocument, {}).then((data) =>
    unwrapGraphQLJson<{ statuses: IssueStatus[] }>(data.issueStatuses),
  );

export const createIssueStatus = (input: {
  name: string;
  color?: string;
  category: IssueStatusCategory;
}) =>
  graphqlRequest(CreateIssueStatusDocument, { input }).then((data) =>
    unwrapGraphQLJson<{ status: IssueStatus }>(data.createIssueStatus),
  );

export const updateIssueStatus = (
  id: string,
  input: { name: string; color?: string; category: IssueStatusCategory },
) =>
  graphqlRequest(UpdateIssueStatusDocument, { id, input }).then((data) =>
    unwrapGraphQLJson<{ status: IssueStatus }>(data.updateIssueStatus),
  );

export const deleteIssueStatus = (id: string, replacementStatus?: string) =>
  graphqlRequest(DeleteIssueStatusDocument, {
    id,
    input: replacementStatus ? { replacementStatus } : null,
  }).then(() => undefined);

export const reorderIssueStatuses = (statuses: { id: string; sortOrder: number }[]) =>
  graphqlRequest(ReorderIssueStatusesDocument, { statuses }).then((data) =>
    unwrapGraphQLJson<{ statuses: IssueStatus[] }>(data.reorderIssueStatuses),
  );

export const getIssueHistory = (id: string) =>
  internalGraphQLGet<{ events: IssueHistoryEvent[] }>(`/api/issues/${id}/history`);

export const listIssueComments = (id: string) =>
  internalGraphQLGet<{ comments: IssueComment[] }>(`/api/issues/${id}/comments`);

export const createIssueComment = (id: string, body: string) =>
  internalGraphQLMutation<{ comment: IssueComment }>("POST", `/api/issues/${id}/comments`, {
    body,
  });

export const listIssueSubscribers = (id: string) =>
  internalGraphQLGet<IssueSubscribersResponse>(`/api/issues/${id}/subscribers`);

export const subscribeToIssue = (id: string) =>
  internalGraphQLMutation<IssueSubscribersResponse>("POST", `/api/issues/${id}/subscribers`);

export const unsubscribeFromIssue = (id: string) =>
  internalGraphQLMutation<IssueSubscribersResponse>("DELETE", `/api/issues/${id}/subscribers`);
