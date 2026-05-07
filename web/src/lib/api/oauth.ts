import { request } from "./client";

export type OAuthAuthorizePreview = {
  clientName: string;
  scope: string;
  resource: string;
  user: {
    id: string;
    name: string;
    email: string;
  };
  organization: {
    id: string;
    name: string;
    slug: string;
  };
};

export const previewOAuthAuthorization = (search: string) =>
  request<OAuthAuthorizePreview>(`/api/oauth/authorize${search}`);

export const decideOAuthAuthorization = (search: string, approve: boolean) => {
  const params = new URLSearchParams(search);
  return request<{ redirectUrl: string }>("/api/oauth/authorize", {
    method: "POST",
    body: JSON.stringify({
      responseType: params.get("response_type") ?? "",
      clientId: params.get("client_id") ?? "",
      redirectUri: params.get("redirect_uri") ?? "",
      state: params.get("state") || undefined,
      scope: params.get("scope") || undefined,
      codeChallenge: params.get("code_challenge") ?? "",
      codeChallengeMethod: params.get("code_challenge_method") ?? "",
      resource: params.get("resource") || undefined,
      approve,
    }),
  });
};
