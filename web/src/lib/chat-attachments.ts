export type ChatAttachmentDraft = {
  id: string;
  file: File;
};

export type ChatAttachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  url: string;
  key?: string;
};

export type ParsedChatContent = {
  text: string;
  attachments: ChatAttachment[];
};

const attachmentStart = "\n\n<produktive_attachments>\n";
const attachmentEnd = "\n</produktive_attachments>";
const maxFileBytes = 10 * 1024 * 1024;
const maxFiles = 5;

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export type ReferencedIssue = {
  id: string;
  title: string;
  status: string;
  priority: string;
};

export function formatIssueReferences(issues: ReferencedIssue[]) {
  if (issues.length === 0) return "";
  const lines = issues.map(
    (issue) =>
      `- id: ${issue.id} — "${issue.title}" (status: ${issue.status}, priority: ${issue.priority})`,
  );
  return `\n\nReferenced issues (use the get_issue tool for full details):\n${lines.join("\n")}`;
}

export type ReferencedTool = {
  displayName: string;
  description: string;
  server: { name: string };
};

export function formatToolReferences(tools: ReferencedTool[]) {
  if (tools.length === 0) return "";
  const lines = tools.map((tool) => {
    const desc = tool.description ? ` — ${tool.description}` : "";
    return `- ${tool.displayName} (${tool.server.name})${desc}`;
  });
  return `\n\nThe user has @-mentioned these tools — prefer them when relevant this turn:\n${lines.join(
    "\n",
  )}`;
}

export type ReferencedChat = {
  id: string;
  title: string;
};

export function formatChatReferences(chats: ReferencedChat[]) {
  if (chats.length === 0) return "";
  const lines = chats.map((chat) => `- id: ${chat.id} — "${chat.title}"`);
  return `\n\nReferenced chats (use the get_chat tool to inspect their messages):\n${lines.join(
    "\n",
  )}`;
}

export type ReferencedNote = {
  id: string;
  title: string;
  visibility: "workspace" | "private";
};

export function formatNoteReferences(notes: ReferencedNote[]) {
  if (notes.length === 0) return "";
  const lines = notes.map((note) => `- id: ${note.id} — "${note.title}" (${note.visibility})`);
  return `\n\nReferenced notes (use the get_note or update_note tool when the user asks you to read or change them):\n${lines.join(
    "\n",
  )}`;
}

export function prepareChatAttachments(files: FileList | File[], currentCount = 0) {
  const incoming = Array.from(files);
  const nextFiles = incoming.slice(0, maxFiles - currentCount);
  const attachments: ChatAttachmentDraft[] = [];
  const errors: string[] = [];

  if (currentCount + incoming.length > maxFiles) {
    errors.push(`Only ${maxFiles} files can be attached.`);
  }

  for (const file of nextFiles) {
    if (file.size > maxFileBytes) {
      errors.push(`${file.name} is larger than ${formatBytes(maxFileBytes)}.`);
      continue;
    }

    attachments.push({
      id: crypto.randomUUID(),
      file,
    });
  }

  return { attachments, errors };
}

export function buildMessageWithAttachments(text: string, attachments: ChatAttachment[]) {
  const trimmed = text.trim();
  if (attachments.length === 0) return trimmed;

  const payload = JSON.stringify(
    attachments.map(({ name, type, size, url, key }) => ({
      name,
      type,
      size,
      url,
      key,
    })),
  );

  return `${trimmed || "Review the attached files."}${attachmentStart}${payload}${attachmentEnd}`;
}

export function attachmentPrompt(attachment: ChatAttachment) {
  return `- ${attachment.name} (${attachment.type || "application/octet-stream"}, ${formatBytes(attachment.size)}): ${attachment.url}`;
}

export function parseMessageWithAttachments(content: string): ParsedChatContent {
  const start = content.indexOf(attachmentStart);
  if (start === -1) {
    return { text: content, attachments: [] };
  }

  const end = content.indexOf(attachmentEnd, start + attachmentStart.length);
  if (end === -1) {
    return { text: content, attachments: [] };
  }

  const text = content.slice(0, start);
  const raw = content.slice(start + attachmentStart.length, end);

  try {
    const parsed = JSON.parse(raw) as Array<{
      name: string;
      type?: string;
      contentType?: string;
      size: number;
      url: string;
      key?: string;
    }>;

    return {
      text,
      attachments: parsed.map((attachment) => ({
        id: `${attachment.name}-${attachment.size}-${attachment.url}`,
        name: attachment.name,
        type: attachment.type ?? attachment.contentType ?? "application/octet-stream",
        size: attachment.size,
        url: attachment.url,
        key: attachment.key,
      })),
    };
  } catch {
    return { text: content, attachments: [] };
  }
}
