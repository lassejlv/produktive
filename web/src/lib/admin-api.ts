import { apiPath } from "@/lib/api";

const request = async <T>(path: string, init?: RequestInit): Promise<T> => {
  const response = await fetch(apiPath(path), {
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Request failed");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
};

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
  metadata?: Record<string, unknown>;
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

export const getAdminSession = () => request<AdminIdentity>("/api/admin/session");

export const getGrowthAnalytics = (range = "30d") =>
  request<GrowthAnalytics>(`/api/admin/analytics/growth?range=${encodeURIComponent(range)}`);

export const listAdminUsers = (params: { search?: string; status?: string; page?: number }) =>
  request<{ users: AdminUserSummary[]; page: PageInfo }>(
    `/api/admin/users?${toQuery({ ...params, limit: 25 })}`,
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
    `/api/admin/organizations?${toQuery({ ...params, limit: 25 })}`,
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

export const listAuditEvents = (params: { page?: number } = {}) =>
  request<{ events: AuditEvent[]; page: PageInfo }>(
    `/api/admin/audit-events?${toQuery({ ...params, limit: 50 })}`,
  );

const toQuery = (params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === "") continue;
    query.set(key, String(value));
  }
  return query.toString();
};
