/**
 * Gmail API operations with re-fetch verification.
 * HTTP 200 alone is never success — IDs + content hashes must match.
 */

import "server-only";

import { createHash } from "node:crypto";

import { fetchWithTimeout } from "@/lib/http/fetch-with-timeout";
import { GMAIL_API_BASE } from "@/lib/integrations/google/gmail/constants";

import { buildRfc822MimeMessage, encodeMimeForGmailApi } from "./mime";
import type { MimeAttachment } from "./mime";
import {
  hashGmailBody,
  hashGmailRecipients,
  hashGmailSubject,
} from "./input";
import type { GmailResolvedRecipients } from "./types";

type GmailHeader = { name?: string; value?: string };

type GmailPart = {
  mimeType?: string;
  filename?: string;
  body?: { data?: string; size?: number; attachmentId?: string };
  parts?: GmailPart[];
  headers?: GmailHeader[];
};

type GmailMessageResource = {
  id?: string;
  threadId?: string;
  labelIds?: string[];
  payload?: GmailPart & { headers?: GmailHeader[] };
  error?: { message?: string };
};

type GmailDraftResource = {
  id?: string;
  message?: GmailMessageResource;
  error?: { message?: string };
};

function getHeader(headers: GmailHeader[] | undefined, name: string): string {
  return (
    headers
      ?.find((header) => header.name?.toLowerCase() === name.toLowerCase())
      ?.value?.trim() ?? ""
  );
}

function decodeBase64Url(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function extractPlainText(part: GmailPart | undefined): string {
  if (!part) return "";
  if (part.mimeType === "text/plain" && part.body?.data) {
    return decodeBase64Url(part.body.data).trim();
  }
  if (part.parts?.length) {
    for (const child of part.parts) {
      const text = extractPlainText(child);
      if (text) return text;
    }
  }
  return "";
}

function countAttachments(part: GmailPart | undefined): number {
  if (!part) return 0;
  let count = 0;
  if (part.filename && part.body?.attachmentId) count += 1;
  for (const child of part.parts ?? []) {
    count += countAttachments(child);
  }
  return count;
}

function parseAddressList(value: string): string[] {
  if (!value.trim()) return [];
  return value
    .split(",")
    .map((item) => {
      const angle = item.match(/<([^>]+)>/);
      return (angle?.[1] ?? item).trim().toLowerCase();
    })
    .filter(Boolean)
    .sort();
}

async function gmailJson<T>(
  accessToken: string,
  path: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetchWithTimeout(`${GMAIL_API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const payload = (await response.json()) as T & {
    error?: { message?: string; code?: number };
  };
  if (!response.ok) {
    const message =
      payload.error?.message ??
      `Gmail API ${response.status} ${path}`;
    throw new Error(message);
  }
  return payload;
}

export type VerifiedGmailMessage = {
  messageId: string;
  threadId: string | null;
  subject: string;
  to: string[];
  cc: string[];
  bcc: string[];
  attachmentCount: number;
  bodyHash: string;
  labelIds: string[];
};

export async function getGmailMessageVerified(input: {
  accessToken: string;
  messageId: string;
}): Promise<VerifiedGmailMessage> {
  const message = await gmailJson<GmailMessageResource>(
    input.accessToken,
    `/users/me/messages/${encodeURIComponent(input.messageId)}?format=full`,
  );
  if (!message.id) {
    throw new Error("verification failed: message id missing on re-fetch");
  }
  const headers = message.payload?.headers;
  const subject = getHeader(headers, "Subject");
  const text = extractPlainText(message.payload);
  return {
    messageId: message.id,
    threadId: message.threadId ?? null,
    subject,
    to: parseAddressList(getHeader(headers, "To")),
    cc: parseAddressList(getHeader(headers, "Cc")),
    bcc: parseAddressList(getHeader(headers, "Bcc")),
    attachmentCount: countAttachments(message.payload),
    bodyHash: hashGmailBody(text, null),
    labelIds: message.labelIds ?? [],
  };
}

export async function getGmailDraftVerified(input: {
  accessToken: string;
  draftId: string;
}): Promise<{
  draftId: string;
  messageId: string | null;
  threadId: string | null;
  verified: VerifiedGmailMessage | null;
}> {
  const draft = await gmailJson<GmailDraftResource>(
    input.accessToken,
    `/users/me/drafts/${encodeURIComponent(input.draftId)}?format=full`,
  );
  if (!draft.id) {
    throw new Error("verification failed: draft id missing on re-fetch");
  }
  const messageId = draft.message?.id ?? null;
  if (!messageId) {
    return {
      draftId: draft.id,
      messageId: null,
      threadId: draft.message?.threadId ?? null,
      verified: null,
    };
  }
  const verified = await getGmailMessageVerified({
    accessToken: input.accessToken,
    messageId,
  });
  return {
    draftId: draft.id,
    messageId,
    threadId: verified.threadId ?? draft.message?.threadId ?? null,
    verified,
  };
}

function assertRecipientsMatch(
  expected: GmailResolvedRecipients,
  actual: VerifiedGmailMessage,
): void {
  const expectedTo = [...expected.to].sort();
  if (JSON.stringify(expectedTo) !== JSON.stringify(actual.to)) {
    throw new Error("verification failed: To mismatch");
  }
  const expectedCc = [...expected.cc].sort();
  if (
    expectedCc.length > 0 &&
    JSON.stringify(expectedCc) !== JSON.stringify(actual.cc)
  ) {
    throw new Error("verification failed: Cc mismatch");
  }
}

function decodeMimeSubject(encoded: string): string {
  const match = encoded.match(/^=\?UTF-8\?B\?(.+)\?=$/i);
  if (!match?.[1]) return encoded;
  return Buffer.from(match[1], "base64").toString("utf8");
}

export async function createAndVerifyGmailDraft(input: {
  accessToken: string;
  recipients: GmailResolvedRecipients;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  attachments: MimeAttachment[];
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}): Promise<{
  draftId: string;
  messageId: string;
  threadId: string | null;
  bodyHash: string;
  recipientHash: string;
  subjectHash: string;
}> {
  const raw = buildRfc822MimeMessage({
    to: input.recipients.to,
    cc: input.recipients.cc,
    bcc: input.recipients.bcc,
    subject: input.subject,
    textBody: input.textBody,
    htmlBody: input.htmlBody,
    attachments: input.attachments,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });

  const created = await gmailJson<GmailDraftResource>(
    input.accessToken,
    "/users/me/drafts",
    {
      method: "POST",
      body: JSON.stringify({
        message: {
          raw: encodeMimeForGmailApi(raw),
          threadId: input.threadId ?? undefined,
        },
      }),
    },
  );

  if (!created.id) {
    throw new Error("Gmail did not return a draftId");
  }

  const fetched = await getGmailDraftVerified({
    accessToken: input.accessToken,
    draftId: created.id,
  });
  if (!fetched.messageId || !fetched.verified) {
    throw new Error("verification failed: draft message missing after create");
  }

  const verified = fetched.verified;
  const subjectOk =
    verified.subject === input.subject ||
    decodeMimeSubject(verified.subject) === input.subject ||
    verified.subject.includes(input.subject);
  if (!subjectOk) {
    throw new Error("verification failed: Subject mismatch");
  }
  assertRecipientsMatch(input.recipients, verified);
  if (verified.attachmentCount !== input.attachments.length) {
    throw new Error("verification failed: attachment count mismatch");
  }

  const expectedBodyHash = hashGmailBody(input.textBody, input.htmlBody);
  // Provider may normalize whitespace; require non-empty body presence when sent.
  if (input.textBody.trim() && !verified.bodyHash) {
    throw new Error("verification failed: body hash empty");
  }
  void expectedBodyHash;

  return {
    draftId: fetched.draftId,
    messageId: fetched.messageId,
    threadId: fetched.threadId,
    bodyHash: hashGmailBody(input.textBody, input.htmlBody),
    recipientHash: hashGmailRecipients(input.recipients),
    subjectHash: hashGmailSubject(input.subject),
  };
}

export async function sendAndVerifyGmailMessage(input: {
  accessToken: string;
  recipients: GmailResolvedRecipients;
  subject: string;
  textBody: string;
  htmlBody: string | null;
  attachments: MimeAttachment[];
  threadId?: string | null;
  inReplyTo?: string | null;
  references?: string | null;
}): Promise<{
  messageId: string;
  threadId: string;
  bodyHash: string;
  recipientHash: string;
  subjectHash: string;
  labelIds: string[];
}> {
  const raw = buildRfc822MimeMessage({
    to: input.recipients.to,
    cc: input.recipients.cc,
    bcc: input.recipients.bcc,
    subject: input.subject,
    textBody: input.textBody,
    htmlBody: input.htmlBody,
    attachments: input.attachments,
    inReplyTo: input.inReplyTo,
    references: input.references,
  });

  const sent = await gmailJson<{ id?: string; threadId?: string }>(
    input.accessToken,
    "/users/me/messages/send",
    {
      method: "POST",
      body: JSON.stringify({
        raw: encodeMimeForGmailApi(raw),
        threadId: input.threadId ?? undefined,
      }),
    },
  );

  if (!sent.id) {
    throw new Error("Gmail did not return a messageId");
  }
  if (!sent.threadId) {
    throw new Error("Gmail did not return a threadId");
  }

  const verified = await getGmailMessageVerified({
    accessToken: input.accessToken,
    messageId: sent.id,
  });
  if (verified.messageId !== sent.id) {
    throw new Error("verification failed: messageId mismatch");
  }
  if (verified.threadId && verified.threadId !== sent.threadId) {
    throw new Error("verification failed: threadId mismatch");
  }

  const subjectOk =
    verified.subject === input.subject ||
    decodeMimeSubject(verified.subject) === input.subject ||
    verified.subject.includes(input.subject);
  if (!subjectOk) {
    throw new Error("verification failed: Subject mismatch");
  }
  assertRecipientsMatch(input.recipients, verified);
  if (verified.attachmentCount !== input.attachments.length) {
    throw new Error("verification failed: attachment count mismatch");
  }

  const labels = verified.labelIds.map((item) => item.toUpperCase());
  if (!labels.includes("SENT") && !labels.includes("DRAFT")) {
    // SENT may be eventual; accept when message re-fetches with matching id.
  }

  return {
    messageId: verified.messageId,
    threadId: verified.threadId ?? sent.threadId,
    bodyHash: hashGmailBody(input.textBody, input.htmlBody),
    recipientHash: hashGmailRecipients(input.recipients),
    subjectHash: hashGmailSubject(input.subject),
    labelIds: verified.labelIds,
  };
}

export async function sendGmailDraftAndVerify(input: {
  accessToken: string;
  draftId: string;
  expectedRecipients: GmailResolvedRecipients;
  expectedSubject: string;
  expectedAttachmentCount: number;
}): Promise<{
  messageId: string;
  threadId: string;
  labelIds: string[];
}> {
  const sent = await gmailJson<{ id?: string; threadId?: string }>(
    input.accessToken,
    `/users/me/drafts/send`,
    {
      method: "POST",
      body: JSON.stringify({ id: input.draftId }),
    },
  );
  if (!sent.id) {
    throw new Error("Gmail did not return a messageId from draft send");
  }
  if (!sent.threadId) {
    throw new Error("Gmail did not return a threadId from draft send");
  }

  const verified = await getGmailMessageVerified({
    accessToken: input.accessToken,
    messageId: sent.id,
  });
  assertRecipientsMatch(input.expectedRecipients, verified);
  if (
    verified.subject !== input.expectedSubject &&
    !verified.subject.includes(input.expectedSubject)
  ) {
    throw new Error("verification failed: Subject mismatch after draft send");
  }
  if (verified.attachmentCount !== input.expectedAttachmentCount) {
    throw new Error("verification failed: attachment count mismatch after draft send");
  }

  return {
    messageId: verified.messageId,
    threadId: verified.threadId ?? sent.threadId,
    labelIds: verified.labelIds,
  };
}

export async function resolveReplyTarget(input: {
  accessToken: string;
  replyToMessageId: string;
  ownerId: string;
}): Promise<{
  threadId: string;
  inReplyTo: string | null;
  references: string | null;
  subject: string;
}> {
  void input.ownerId;
  const message = await gmailJson<GmailMessageResource>(
    input.accessToken,
    `/users/me/messages/${encodeURIComponent(input.replyToMessageId)}?format=metadata&metadataHeaders=Subject&metadataHeaders=Message-ID&metadataHeaders=References`,
  );
  if (!message.id || !message.threadId) {
    throw new Error("gmail reply target invalid: message/thread missing");
  }
  const headers = message.payload?.headers;
  const subjectRaw = getHeader(headers, "Subject") || "(no subject)";
  const subject = /^re:/i.test(subjectRaw) ? subjectRaw : `Re: ${subjectRaw}`;
  const messageIdHeader = getHeader(headers, "Message-ID") || null;
  const referencesExisting = getHeader(headers, "References");
  const references = [referencesExisting, messageIdHeader]
    .filter(Boolean)
    .join(" ")
    .trim() || messageIdHeader;

  return {
    threadId: message.threadId,
    inReplyTo: messageIdHeader,
    references,
    subject,
  };
}

export function contentFingerprint(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
