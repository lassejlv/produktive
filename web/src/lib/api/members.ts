import { MembersDocument } from "@/gql/graphql";
import { graphqlRequest, unwrapGraphQLJson } from "@/lib/api/graphql/client";
import type { JsonObject } from "@/lib/json";
import {
  internalGraphQLGet,
  internalGraphQLMutation,
  request,
} from "./client";
import type { IssueHistoryChange } from "./issues";

export type MemberIssue = {
  id: string;
  title: string;
  status: string;
  priority: string;
  updatedAt: string;
};

export type MemberActivity = {
  id: string;
  action: string;
  changes: IssueHistoryChange[];
  createdAt: string;
  issue: MemberIssue | null;
};

export type MemberProfile = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  twoFactorEnabled: boolean;
  activeSessions: number;
  joinedAt: string;
  stats: {
    assignedIssues: number;
    createdIssues: number;
    activityEvents: number;
  };
  assignedIssues: MemberIssue[];
  createdIssues: MemberIssue[];
  activity: MemberActivity[];
};

export type Member = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  role: string;
  twoFactorEnabled: boolean;
  activeSessions: number;
};

export const getMemberProfile = (id: string) =>
  internalGraphQLGet<{ member: MemberProfile }>(`/api/members/${id}`);

export const listMembers = () =>
  graphqlRequest(MembersDocument, {}).then((data) =>
    unwrapGraphQLJson<{ members: Member[] }>(data.members),
  );

export const updateMemberRole = (id: string, role: string) =>
  internalGraphQLMutation<void>("PATCH", `/api/members/${id}`, { role });

export const removeMember = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/members/${id}`);

export const resetMemberTwoFactor = (userId: string) =>
  internalGraphQLMutation<void>("POST", "/api/security/two-factor-recovery/reset", {
    userId,
  });

export const revokeMemberSessions = (userId: string) =>
  internalGraphQLMutation<{ revoked: number }>(
    "POST",
    "/api/security/member-sessions/revoke",
    { userId },
  );

export type Invitation = {
  id: string;
  email: string;
  role: string;
  invitedByName: string | null;
  expiresAt: string;
  createdAt: string;
};

export type InvitationLookup = {
  valid: boolean;
  expired: boolean;
  revoked: boolean;
  accepted: boolean;
  organizationName: string | null;
  inviterName: string | null;
  email: string | null;
};

export type AcceptInvitationResponse = {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    emailVerified: boolean;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export const listInvitations = () =>
  internalGraphQLGet<{ invitations: Invitation[] }>(
    "/api/organizations/me/invitations",
  );

export const createInvitation = (email: string, role?: string) =>
  internalGraphQLMutation<Invitation>(
    "POST",
    "/api/organizations/me/invitations",
    { email, role },
  );

export const revokeInvitation = (id: string) =>
  internalGraphQLMutation<{ invitations: Invitation[] }>(
    "DELETE",
    `/api/organizations/me/invitations/${id}`,
  );

export const resendInvitation = (id: string) =>
  internalGraphQLMutation<Invitation>(
    "POST",
    `/api/organizations/me/invitations/${id}/resend`,
  );

export const lookupInvitation = (token: string) =>
  request<InvitationLookup>(
    `/api/invitations/lookup?token=${encodeURIComponent(token)}`,
  );

export const acceptInvitation = (token: string) =>
  request<AcceptInvitationResponse>("/api/invitations/accept", {
    method: "POST",
    body: JSON.stringify({ token }),
  });

export type PermissionInfo = {
  key: string;
  label: string;
  group: string;
};

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  permissions: string[];
  isSystem: boolean;
  archived: boolean;
};

export const listRoles = () =>
  internalGraphQLGet<{ roles: Role[]; permissions: PermissionInfo[] }>(
    "/api/roles",
  );

export const createRole = (input: {
  name: string;
  description?: string;
  permissions: string[];
}) => internalGraphQLMutation<{ role: Role }>("POST", "/api/roles", input);

export const updateRole = (
  id: string,
  input: { name: string; description?: string; permissions: string[] },
) =>
  internalGraphQLMutation<{ role: Role }>("PATCH", `/api/roles/${id}`, input);

export const deleteRole = (id: string) =>
  internalGraphQLMutation<void>("DELETE", `/api/roles/${id}`);

export type SecurityEventUser = {
  id: string;
  name: string;
  email: string;
};

export type SecurityEvent = {
  id: string;
  eventType: string;
  actor: SecurityEventUser | null;
  target: SecurityEventUser | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: JsonObject;
  createdAt: string;
};

export const listSecurityEvents = () =>
  internalGraphQLGet<{ events: SecurityEvent[] }>("/api/security/events");

export const sendTwoFactorNudges = () =>
  internalGraphQLMutation<{ sent: number }>(
    "POST",
    "/api/security/two-factor-nudges",
  );

export const recordTwoFactorEnforcementBlocked = () =>
  internalGraphQLMutation<{ ok: true }>(
    "POST",
    "/api/security/two-factor-enforcement/blocked",
  );
