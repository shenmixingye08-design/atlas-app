import "server-only";

import {
  GMAIL_API_BASE,
  GMAIL_LABEL_NAMES,
  GMAIL_LIST_MAX_RESULTS,
} from "./constants";
import type { GmailMessage } from "./types";

type GmailHeader = { name?: string; value?: string };

type GmailMessagePart = {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
};

type GmailMessageResource = {
  id?: string;
  labelIds?: string[];
  internalDate?: string;
  payload?: GmailMessagePart & { headers?: GmailHeader[] };
  error?: { message?: string };
};

type GmailListResponse = {
  messages?: { id?: string; threadId?: string }[];
  error?: { message?: string };
};

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
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

  if (part.body?.data && !part.parts?.length) {
    return decodeBase64Url(part.body.data).trim();
  }

  return "";
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
    subject,
    sender: parseSender(fromHeader),
    receivedAt,
    bodyText,
    isUnread: labelIds.includes("UNREAD"),
    labels: mapLabels(labelIds),
  };
}

async function gmailFetch<T>(
  accessToken: string,
  path: string,
): Promise<T> {
  const response = await fetch(`${GMAIL_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });

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
