import { request, toQueryString } from "@/lib/api/client";
import type { JsonObject } from "@/lib/json";

export type AdminIdentity = {
  user: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  role: string;
};

export type GrowthPoint = {
  bucket: string;
  users: number;
  organizations: number;
};

export type GrowthAnalytics = {
  range: string;
  bucket: string;
  totals: {
    users: number;
    organizations: number;
    suspendedUsers: number;
    suspendedOrganizations: number;
  };
  points: GrowthPoint[];
};

export type PageInfo = {
  page: number;
  limit: number;
  total: number;
};

export type AdminUserSummary = {
  id: string;
  name: string;
  email: string;
  image: string | null;
  emailVerified: boolean;
  organizationCount: number;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
  lastSessionAt: string | null;
};

export type AdminOrganizationSummary = {
  id: string;
  name: string;
  slug: string;
  image: string | null;
  memberCount: number;
  ownerCount: number;
  issueCount: number;
  projectCount: number;
  suspendedAt: string | null;
  suspensionReason: string | null;
  createdAt: string;
};

export type AuditEvent = {
  id: string;
  actor: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  };
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  metadata?: JsonObject;
  createdAt: string;
};

export type ActivityEvent = {
  id: string;
  organizationId: string;
  issueId: string;
  issueTitle: string | null;
  action: string;
  createdAt: string;
};

export type SessionStats = {
  active: number;
  revoked: number;
  total: number;
};

export type UserDetail = {
  user: AdminUserSummary;
  memberships: {
    organizationId: string;
    organizationName: string;
    organizationSlug: string;
    role: string;
    joinedAt: string;
    organizationSuspendedAt: string | null;
  }[];
  sessions: SessionStats;
  activityEvents: ActivityEvent[];
  auditEvents: AuditEvent[];
};

export type OrganizationDetail = {
  organization: AdminOrganizationSummary;
  members: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    joinedAt: string;
    suspendedAt: string | null;
  }[];
  owners: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    role: string;
    joinedAt: string;
    suspendedAt: string | null;
  }[];
  sessions: SessionStats;
  activityEvents: ActivityEvent[];
  auditEvents: AuditEvent[];
};

export type SupportTicketSummary = {
  id: string;
  number: string;
  subject: string;
  status: "open" | "pending" | "closed";
  priority: "normal" | "high" | "urgent";
  customerEmail: string;
  customerName: string | null;
  assignedAdminId: string | null;
  lastMessageAt: string;
  closedAt: string | null;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
};

export type SupportMessage = {
  id: string;
  direction: "inbound" | "outbound";
  fromEmail: string;
  toEmail: string;
  cc: string[];
  subject: string;
  bodyText: string | null;
  bodyHtml: string | null;
  messageId: string | null;
  inReplyTo: string | null;
  references: string | null;
  deliveryStatus: "received" | "pending" | "sent" | "failed";
  deliveryProviderId: string | null;
  deliveryError: string | null;
  sentByAdminId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type SupportTicketEvent = {
  id: string;
  eventType: string;
  metadata: JsonObject;
  actorAdminId: string | null;
  createdAt: string;
};

export type SupportTicketDetail = {
  ticket: SupportTicketSummary;
  messages: SupportMessage[];
  events: SupportTicketEvent[];
  assignedAdmin: {
    id: string;
    name: string;
    email: string;
    image: string | null;
  } | null;
  customerUser: {
    id: string;
    name: string;
    email: string;
    image: string | null;
    emailVerified: boolean;
    suspendedAt: string | null;
    suspensionReason: string | null;
    createdAt: string;
    lastSessionAt: string | null;
    memberships: {
      organizationId: string;
      organizationName: string;
      organizationSlug: string;
      role: string;
      joinedAt: string;
      organizationSuspendedAt: string | null;
    }[];
  } | null;
};

export const getAdminSession = () => request<AdminIdentity>("/api/admin/session");

export const getGrowthAnalytics = (range = "30d") =>
  request<GrowthAnalytics>(`/api/admin/analytics/growth?range=${encodeURIComponent(range)}`);

export const listAdminUsers = (params: { search?: string; status?: string; page?: number }) =>
  request<{ users: AdminUserSummary[]; page: PageInfo }>(
    `/api/admin/users?${toQueryString({ ...params, limit: 25 })}`,
  );

export const getAdminUser = (id: string) => request<UserDetail>(`/api/admin/users/${id}`);

export const suspendAdminUser = (id: string, input: { reason: string; note?: string }) =>
  request<void>(`/api/admin/users/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const unsuspendAdminUser = (id: string) =>
  request<void>(`/api/admin/users/${id}/unsuspend`, { method: "POST" });

export const listAdminOrganizations = (params: {
  search?: string;
  status?: string;
  page?: number;
}) =>
  request<{ organizations: AdminOrganizationSummary[]; page: PageInfo }>(
    `/api/admin/organizations?${toQueryString({ ...params, limit: 25 })}`,
  );

export const getAdminOrganization = (id: string) =>
  request<OrganizationDetail>(`/api/admin/organizations/${id}`);

export const suspendAdminOrganization = (id: string, input: { reason: string; note?: string }) =>
  request<void>(`/api/admin/organizations/${id}/suspend`, {
    method: "POST",
    body: JSON.stringify(input),
  });

export const unsuspendAdminOrganization = (id: string) =>
  request<void>(`/api/admin/organizations/${id}/unsuspend`, { method: "POST" });

export const resetAdminOrganizationAiUsage = (id: string, scope: "weekly" | "all") =>
  request<void>(`/api/admin/organizations/${id}/ai-usage/reset`, {
    method: "POST",
    body: JSON.stringify({ scope }),
  });

export const listAuditEvents = (params: { page?: number } = {}) =>
  request<{ events: AuditEvent[]; page: PageInfo }>(
    `/api/admin/audit-events?${toQueryString({ ...params, limit: 50 })}`,
  );

export const listSupportTickets = (params: { status?: string; search?: string; page?: number }) =>
  request<{ tickets: SupportTicketSummary[]; page: PageInfo }>(
    `/api/admin/support/tickets?${toQueryString({ ...params, limit: 30 })}`,
  );

export const createSupportTicket = (input: {
  toEmail: string;
  customerName?: string;
  subject: string;
  bodyText: string;
  priority?: string;
}) =>
  request<{ ticket: SupportTicketDetail; message: SupportMessage }>("/api/admin/support/tickets", {
    method: "POST",
    body: JSON.stringify(input),
  });

export const getSupportTicket = (id: string) =>
  request<SupportTicketDetail>(`/api/admin/support/tickets/${id}`);

export const updateSupportTicket = (
  id: string,
  input: { status?: string; priority?: string; assignedAdminId?: string | null },
) =>
  request<SupportTicketDetail>(`/api/admin/support/tickets/${id}`, {
    method: "PATCH",
    body: JSON.stringify(input),
  });

export const replyToSupportTicket = (
  id: string,
  input: { bodyText: string; closeAfterReply?: boolean },
) =>
  request<{ ticket: SupportTicketDetail; message: SupportMessage }>(
    `/api/admin/support/tickets/${id}/reply`,
    {
      method: "POST",
      body: JSON.stringify(input),
    },
  );

export const retrySupportMessage = (id: string) =>
  request<SupportTicketDetail>(`/api/admin/support/messages/${id}/retry`, { method: "POST" });
