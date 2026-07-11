import "server-only";

import {
  GMAIL_API_BASE,
  GMAIL_LABEL_NAMES,
  GMAIL_LIST_MAX_RESULTS,
} from "./constants";
import type {
  GmailAttachmentMeta,
  GmailLabel,
  GmailMessage,
} from "./types";

type GmailHeader = { name?: string; value?: string };

type GmailMessagePart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailMessagePart[];
  headers?: GmailHeader[];
};

type GmailMessageResource = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
  error?: { message?: string };
};

type GmailListResponse = {
  messages?: { id?: string; threadId?: string }[];
  error?: { message?: string };
};

type GmailLabelsResponse = {
  labels?: {
    id?: string;
    name?: string;
    type?: string;
    messagesTotal?: number;
    messagesUnread?: number;
  }[];
  error?: { message?: string };
};

type GmailAttachmentResponse = {
  data?: string;
  size?: number;
  error?: { message?: string };
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function decodeBase64UrlToBuffer(value: string): Buffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64");
}

function encodeBase64Url(value: string): string {
  return Buffer.from(value, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  const match = headers?.find(
    (header) => header.name?.toLowerCase() === name.toLowerCase(),
  );
  return match?.value?.trim() ?? "";
}

function extractBodyText(part: GmailMessagePart | undefined): string {
  if (!part) return "";

  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data).trim();
  }

  if (part.parts?.length) {
    for (const child of part.parts) {
      const text = extractBodyText(child);
      if (text) return text;
    }
    for (const child of part.parts) {
      if (child.mimeType === "text/html" && child.body?.data) {
        return stripHtml(decodeBase64Url(child.body.data));
      }
    }
  }

  if (part.mimeType === "text/html" && part.body?.data) {
    return stripHtml(decodeBase64Url(part.body.data));
  }

  if (part.body?.data && !part.parts?.length && !part.filename) {
    return decodeBase64Url(part.body.data).trim();
  }

  return "";
}

function collectAttachments(
  part: GmailMessagePart | undefined,
  collected: GmailAttachmentMeta[] = [],
): GmailAttachmentMeta[] {
  if (!part) return collected;

  const filename = part.filename?.trim();
  const attachmentId = part.body?.attachmentId;
  if (filename && attachmentId) {
    collected.push({
      attachmentId,
      filename,
      mimeType: part.mimeType ?? "application/octet-stream",
      size: part.body?.size ?? 0,
    });
  }

  for (const child of part.parts ?? []) {
    collectAttachments(child, collected);
  }

  return collected;
}

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function parseSender(fromHeader: string): string {
  const match = fromHeader.match(/^(.+?)\s*<[^>]+>$/);
  if (match?.[1]) {
    return match[1].replace(/^["']|["']$/g, "").trim();
  }
  return fromHeader.trim() || "(送信者不明)";
}

function extractEmailAddress(header: string): string {
  const match = header.match(/<([^>]+)>/);
  if (match?.[1]) return match[1].trim();
  if (header.includes("@")) return header.trim();
  return header.trim();
}

function mapLabels(labelIds: readonly string[] | undefined): string[] {
  return (labelIds ?? [])
    .filter((id) => id !== "UNREAD")
    .map((id) => GMAIL_LABEL_NAMES[id] ?? id);
}

export function normalizeGmailMessage(
  resource: GmailMessageResource,
): GmailMessage | null {
  if (!resource.id) return null;

  const headers = resource.payload?.headers ?? [];
  const subject = getHeader(headers, "Subject") || "(件名なし)";
  const fromHeader = getHeader(headers, "From");
  const dateHeader = getHeader(headers, "Date");
  const internalMs = resource.internalDate
    ? Number.parseInt(resource.internalDate, 10)
    : Number.NaN;
  const receivedAt = Number.isFinite(internalMs)
    ? new Date(internalMs).toISOString()
    : dateHeader
      ? new Date(dateHeader).toISOString()
      : new Date().toISOString();

  const labelIds = resource.labelIds ?? [];
  const bodyText = extractBodyText(resource.payload).slice(0, 8000);

  return {
    id: resource.id,
    threadId: resource.threadId ?? null,
    subject,
    sender: parseSender(fromHeader),
    fromEmail: extractEmailAddress(fromHeader),
    toHeader: getHeader(headers, "To"),
    messageIdHeader: getHeader(headers, "Message-ID") || null,
    receivedAt,
    bodyText,
    isUnread: labelIds.includes("UNREAD"),
    labels: mapLabels(labelIds),
    labelIds,
    attachments: collectAttachments(resource.payload),
  };
}

async function gmailFetch<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (response.status === 204) {
    return {} as T;
  }

  const payload = (await response.json()) as T & { error?: { message?: string } };

  if (!response.ok) {
    throw new Error(payload.error?.message ?? "Gmail API request failed");
  }

  return payload;
}

export async function fetchGmailMessageIds(input: {
  accessToken: string;
  query: string;
  maxResults?: number;
}): Promise<string[]> {
  const params = new URLSearchParams({
    q: input.query,
    maxResults: String(input.maxResults ?? GMAIL_LIST_MAX_RESULTS),
  });

  const payload = await gmailFetch<GmailListResponse>(
    input.accessToken,
    `/users/me/messages?${params.toString()}`,
  );

  return (payload.messages ?? [])
    .map((message) => message.id)
    .filter((id): id is string => Boolean(id));
}

export async function fetchGmailMessage(input: {
  accessToken: string;
  messageId: string;
}): Promise<GmailMessage | null> {
  const payload = await gmailFetch<GmailMessageResource>(
    input.accessToken,
    `/users/me/messages/${encodeURIComponent(input.messageId)}?format=full`,
  );

  return normalizeGmailMessage(payload);
}

export async function fetchGmailMessages(input: {
  accessToken: string;
  query: string;
  maxResults?: number;
}): Promise<GmailMessage[]> {
  const ids = await fetchGmailMessageIds(input);
  const messages = await Promise.all(
    ids.map((messageId) =>
      fetchGmailMessage({ accessToken: input.accessToken, messageId }),
    ),
  );

  return messages
    .filter((message): message is GmailMessage => message !== null)
    .sort(
      (a, b) =>
        new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime(),
    );
}

export async function listGmailLabels(input: {
  accessToken: string;
}): Promise<GmailLabel[]> {
  const payload = await gmailFetch<GmailLabelsResponse>(
    input.accessToken,
    "/users/me/labels",
  );

  return (payload.labels ?? [])
    .filter(
      (
        label,
      ): label is {
        id: string;
        name: string;
        type?: string;
        messagesTotal?: number;
        messagesUnread?: number;
      } => Boolean(label.id && label.name),
    )
    .map(
      (label): GmailLabel => ({
        id: label.id,
        name: GMAIL_LABEL_NAMES[label.id] ?? label.name,
        type: label.type === "system" ? "system" : "user",
        messagesTotal: label.messagesTotal,
        messagesUnread: label.messagesUnread,
      }),
    )
    .sort((a, b) => a.name.localeCompare(b.name, "ja"));
}

export async function createGmailLabel(input: {
  accessToken: string;
  name: string;
}): Promise<GmailLabel> {
  const payload = await gmailFetch<{
    id?: string;
    name?: string;
    type?: string;
  }>(input.accessToken, "/users/me/labels", {
    method: "POST",
    body: JSON.stringify({
      name: input.name,
      labelListVisibility: "labelShow",
      messageListVisibility: "show",
    }),
  });

  if (!payload.id || !payload.name) {
    throw new Error("Failed to create Gmail label");
  }

  return {
    id: payload.id,
    name: payload.name,
    type: "user",
  };
}

export async function modifyGmailMessageLabels(input: {
  accessToken: string;
  messageId: string;
  addLabelIds?: string[];
  removeLabelIds?: string[];
}): Promise<void> {
  await gmailFetch(
    input.accessToken,
    `/users/me/messages/${encodeURIComponent(input.messageId)}/modify`,
    {
      method: "POST",
      body: JSON.stringify({
        addLabelIds: input.addLabelIds ?? [],
        removeLabelIds: input.removeLabelIds ?? [],
      }),
    },
  );
}

export async function archiveGmailMessage(input: {
  accessToken: string;
  messageId: string;
}): Promise<void> {
  await modifyGmailMessageLabels({
    ...input,
    removeLabelIds: ["INBOX"],
  });
}

export async function moveGmailMessageToSpam(input: {
  accessToken: string;
  messageId: string;
}): Promise<void> {
  await modifyGmailMessageLabels({
    ...input,
    addLabelIds: ["SPAM"],
    removeLabelIds: ["INBOX"],
  });
}

export async function trashGmailMessage(input: {
  accessToken: string;
  messageId: string;
}): Promise<void> {
  await gmailFetch(
    input.accessToken,
    `/users/me/messages/${encodeURIComponent(input.messageId)}/trash`,
    { method: "POST" },
  );
}

export async function addLabelToGmailMessage(input: {
  accessToken: string;
  messageId: string;
  labelId: string;
}): Promise<void> {
  await modifyGmailMessageLabels({
    accessToken: input.accessToken,
    messageId: input.messageId,
    addLabelIds: [input.labelId],
  });
}

export async function fetchGmailAttachment(input: {
  accessToken: string;
  messageId: string;
  attachmentId: string;
}): Promise<Buffer> {
  const payload = await gmailFetch<GmailAttachmentResponse>(
    input.accessToken,
    `/users/me/messages/${encodeURIComponent(input.messageId)}/attachments/${encodeURIComponent(input.attachmentId)}`,
  );

  if (!payload.data) {
    throw new Error("Attachment data was empty");
  }

  return decodeBase64UrlToBuffer(payload.data);
}

function buildRfc822Reply(input: {
  to: string;
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
}): string {
  const encodedBody = Buffer.from(input.body, "utf8").toString("base64");
  const lines = [
    `To: ${input.to}`,
    `Subject: =?UTF-8?B?${Buffer.from(input.subject, "utf8").toString("base64")}?=`,
    "MIME-Version: 1.0",
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
  ];

  if (input.inReplyTo) {
    lines.push(`In-Reply-To: ${input.inReplyTo}`);
    lines.push(`References: ${input.references ?? input.inReplyTo}`);
  }

  lines.push("", encodedBody);
  return lines.join("\r\n");
}

export async function sendGmailReply(input: {
  accessToken: string;
  message: GmailMessage;
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string; threadId: string | null }> {
  const raw = buildRfc822Reply({
    to: input.to,
    subject: input.subject,
    body: input.body,
    inReplyTo: input.message.messageIdHeader,
    references: input.message.messageIdHeader,
  });

  const payload = await gmailFetch<{ id?: string; threadId?: string }>(
    input.accessToken,
    "/users/me/messages/send",
    {
      method: "POST",
      body: JSON.stringify({
        raw: encodeBase64Url(raw),
        threadId: input.message.threadId ?? undefined,
      }),
    },
  );

  if (!payload.id) {
    throw new Error("Gmail did not return a sent message id");
  }

  return { id: payload.id, threadId: payload.threadId ?? null };
}

export async function createGmailDraft(input: {
  accessToken: string;
  message: GmailMessage;
  to: string;
  subject: string;
  body: string;
}): Promise<{ id: string }> {
  const raw = buildRfc822Reply({
    to: input.to,
    subject: input.subject,
    body: input.body,
    inReplyTo: input.message.messageIdHeader,
    references: input.message.messageIdHeader,
  });

  const payload = await gmailFetch<{ id?: string }>(
    input.accessToken,
    "/users/me/drafts",
    {
      method: "POST",
      body: JSON.stringify({
        message: {
          raw: encodeBase64Url(raw),
          threadId: input.message.threadId ?? undefined,
        },
      }),
    },
  );

  if (!payload.id) {
    throw new Error("Gmail did not return a draft id");
  }

  return { id: payload.id };
}

/** Best-effort text extraction from PDF bytes (no extra dependency). */
export { extractTextFromPdfBuffer } from "@/lib/documents/extract-pdf-text";
