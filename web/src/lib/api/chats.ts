import {
  ChatAccessDocument,
  ChatDocument,
  ChatsDocument,
  CreateChatDocument,
  DeleteChatDocument,
  GrantChatAccessDocument,
  PostChatMessageDocument,
  RevokeChatAccessDocument,
} from "@/gql/graphql";
import { graphqlRequest, unwrapGraphQLJson } from "@/lib/graphql/client";
import { apiPath } from "./client";

export type Chat = {
  id: string;
  title: string;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ChatAccessEntry = {
  userId: string;
  name: string;
  email: string;
  image: string | null;
  isCreator: boolean;
};

export type ChatToolCallRecord = {
  id: string;
  name: string;
  arguments: string;
  reasoningContent?: string;
  result?: unknown;
};

export type ChatMessageRecord = {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
  toolCalls?: ChatToolCallRecord[];
};

export type UploadedChatAttachment = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  key: string;
  url: string;
};

export type ChatStreamEvent =
  | { type: "user"; message: ChatMessageRecord }
  | { type: "delta"; content: string }
  | { type: "reasoning"; content: string }
  | { type: "toolStart"; toolCall: ChatToolCallRecord }
  | { type: "toolResult"; id: string; result: unknown }
  | { type: "done"; messages: ChatMessageRecord[] }
  | { type: "error"; error: string; messages?: ChatMessageRecord[] };

export type ReasoningEffort = "auto" | "low" | "medium" | "high" | "xhigh";

export const listChats = () =>
  graphqlRequest(ChatsDocument, {}).then((data) =>
    unwrapGraphQLJson<{ chats: Chat[] }>(data.chats),
  );

export const createChat = () =>
  graphqlRequest(CreateChatDocument, {}).then((data) =>
    unwrapGraphQLJson<{ chat: Chat }>(data.createChat),
  );

export const getChat = (id: string) =>
  graphqlRequest(ChatDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ chat: Chat; messages: ChatMessageRecord[] }>(data.chat),
  );

export const deleteChat = (id: string) =>
  graphqlRequest(DeleteChatDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ ok: true }>(data.deleteChat),
  );

export const listChatAccess = (id: string) =>
  graphqlRequest(ChatAccessDocument, { id }).then((data) =>
    unwrapGraphQLJson<{ access: ChatAccessEntry[] }>(data.chatAccess),
  );

export const grantChatAccess = (id: string, userId: string) =>
  graphqlRequest(GrantChatAccessDocument, { id, input: { userId } }).then((data) =>
    unwrapGraphQLJson<{ access: ChatAccessEntry }>(data.grantChatAccess),
  );

export const revokeChatAccess = (id: string, userId: string) =>
  graphqlRequest(RevokeChatAccessDocument, { id, userId }).then((data) =>
    unwrapGraphQLJson<{ ok: true }>(data.revokeChatAccess),
  );

export const postChatMessage = (id: string, content: string) =>
  graphqlRequest(PostChatMessageDocument, { id, input: { content } }).then((data) =>
    unwrapGraphQLJson<{ messages: ChatMessageRecord[] }>(data.postChatMessage),
  );

export const uploadChatAttachment = async (id: string, file: File) => {
  const form = new FormData();
  form.append("file", file);

  const response = await fetch(apiPath(`/api/chats/${id}/attachments`), {
    method: "POST",
    credentials: "include",
    body: form,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Failed to upload attachment");
  }

  return response.json() as Promise<UploadedChatAttachment>;
};

export const streamChatMessage = async (
  id: string,
  content: string,
  onEvent: (event: ChatStreamEvent) => void,
  options?: { model?: string; reasoningEffort?: ReasoningEffort },
) => {
  const body: Record<string, unknown> = { content };
  if (options?.model) body.model = options.model;
  if (options?.reasoningEffort && options.reasoningEffort !== "auto") {
    body.reasoningEffort = options.reasoningEffort;
  }
  const response = await fetch(apiPath(`/api/chats/${id}/messages/stream`), {
    method: "POST",
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => null);
    throw new Error(error?.error ?? "Request failed");
  }

  if (!response.body) {
    throw new Error("Streaming is not supported in this browser");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      onEvent(JSON.parse(trimmed) as ChatStreamEvent);
    }
  }

  buffer += decoder.decode();
  const trimmed = buffer.trim();
  if (trimmed) {
    onEvent(JSON.parse(trimmed) as ChatStreamEvent);
  }
};
