import {
  internalGraphQLGet,
  internalGraphQLMutation,
  request,
} from "./client";

export type SlackConnection = {
  connected: boolean;
  teamId: string | null;
  teamName: string | null;
  botUserId: string | null;
  scope: string | null;
  agentEnabled: boolean;
  connectedAt: string | null;
};

export type SlackLinkPreview = {
  slackTeamId: string;
  slackUserId: string;
  expiresAt: string;
  linkedOrganization: {
    id: string;
    name: string;
    slug: string;
  };
};

export type SlackLinkResult = {
  ok: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export const getSlackConnection = () =>
  internalGraphQLGet<SlackConnection>("/api/slack/connection");

export const startSlackOAuth = () =>
  request<{ url: string }>("/api/slack/oauth/start", { method: "POST" });

export const updateSlackConnection = (patch: { agentEnabled?: boolean }) =>
  internalGraphQLMutation<SlackConnection>(
    "PATCH",
    "/api/slack/connection",
    patch,
  );

export const disconnectSlack = () =>
  internalGraphQLMutation<void>("DELETE", "/api/slack/connection");

export const previewSlackLink = (state: string) =>
  request<SlackLinkPreview>(`/api/slack/link/${encodeURIComponent(state)}`);

export const completeSlackLink = (state: string) =>
  request<SlackLinkResult>(`/api/slack/link/${encodeURIComponent(state)}`, {
    method: "POST",
  });
