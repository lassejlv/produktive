import { request } from "./client";

export type DiscordLinkPreview = {
  guildId: string;
  discordUserId: string;
  expiresAt: string;
  linkedOrganization: {
    id: string;
    name: string;
    slug: string;
  } | null;
};

export type DiscordLinkResult = {
  ok: boolean;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export const previewDiscordLink = (state: string) =>
  request<DiscordLinkPreview>(`/api/discord/link/${encodeURIComponent(state)}`);

export const completeDiscordLink = (state: string, organizationId: string) =>
  request<DiscordLinkResult>(`/api/discord/link/${encodeURIComponent(state)}`, {
    method: "POST",
    body: JSON.stringify({ organizationId }),
  });
