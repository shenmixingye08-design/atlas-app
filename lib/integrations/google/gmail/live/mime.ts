/**
 * RFC-compliant MIME builder for Gmail raw messages.
 */

import { randomBytes } from "node:crypto";

import { formatAddressList } from "./recipients";

export type MimeAttachment = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
};

export type BuildMimeInput = {
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  textBody: string;
  htmlBody: string | null;
  attachments: MimeAttachment[];
  inReplyTo?: string | null;
  references?: string | null;
};

function assertNoInjection(value: string, field: string): void {
  if (/[\r\n]/.test(value)) {
    throw new Error(`gmail invalid MIME: CRLF in ${field}`);
  }
}

function encodeSubject(subject: string): string {
  assertNoInjection(subject, "subject");
  return `=?UTF-8?B?${Buffer.from(subject, "utf8").toString("base64")}?=`;
}

function encodeRfc2047FileName(fileName: string): string {
  assertNoInjection(fileName, "fileName");
  return `=?UTF-8?B?${Buffer.from(fileName, "utf8").toString("base64")}?=`;
}

function encodeBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function wrapBase64(value: string, lineLength = 76): string {
  const chunks: string[] = [];
  for (let i = 0; i < value.length; i += lineLength) {
    chunks.push(value.slice(i, i + lineLength));
  }
  return chunks.join("\r\n");
}

function boundary(): string {
  return `----=_Part_${randomBytes(12).toString("hex")}`;
}

function buildTextPart(textBody: string): string {
  const encoded = wrapBase64(Buffer.from(textBody, "utf8").toString("base64"));
  return [
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encoded,
  ].join("\r\n");
}

function buildHtmlPart(htmlBody: string): string {
  const encoded = wrapBase64(Buffer.from(htmlBody, "utf8").toString("base64"));
  return [
    'Content-Type: text/html; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    encoded,
  ].join("\r\n");
}

function buildAlternative(textBody: string, htmlBody: string): string {
  const alt = boundary();
  return [
    `Content-Type: multipart/alternative; boundary="${alt}"`,
    "",
    `--${alt}`,
    buildTextPart(textBody),
    `--${alt}`,
    buildHtmlPart(htmlBody),
    `--${alt}--`,
  ].join("\r\n");
}

function buildAttachmentPart(attachment: MimeAttachment): string {
  const encoded = wrapBase64(attachment.buffer.toString("base64"));
  const safeType = attachment.mimeType.replace(/[\r\n]/g, "") || "application/octet-stream";
  return [
    `Content-Type: ${safeType}; name="${encodeRfc2047FileName(attachment.fileName)}"`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename="${encodeRfc2047FileName(attachment.fileName)}"`,
    "",
    encoded,
  ].join("\r\n");
}

export function buildRfc822MimeMessage(input: BuildMimeInput): string {
  assertNoInjection(formatAddressList(input.to), "to");
  if (input.cc.length) assertNoInjection(formatAddressList(input.cc), "cc");
  if (input.bcc.length) assertNoInjection(formatAddressList(input.bcc), "bcc");

  const headers: string[] = [
    `To: ${formatAddressList(input.to)}`,
  ];
  if (input.cc.length) headers.push(`Cc: ${formatAddressList(input.cc)}`);
  // BCC is included in the MIME for Gmail API raw upload; Gmail strips it from recipients' view.
  if (input.bcc.length) headers.push(`Bcc: ${formatAddressList(input.bcc)}`);
  headers.push(`Subject: ${encodeSubject(input.subject)}`);
  headers.push("MIME-Version: 1.0");

  if (input.inReplyTo) {
    assertNoInjection(input.inReplyTo, "inReplyTo");
    headers.push(`In-Reply-To: ${input.inReplyTo}`);
    const refs = input.references ?? input.inReplyTo;
    assertNoInjection(refs, "references");
    headers.push(`References: ${refs}`);
  }

  const textBody = input.textBody || "(no body)";
  const htmlBody = input.htmlBody?.trim() ? input.htmlBody : null;
  const hasAttachments = input.attachments.length > 0;

  let body: string;
  if (hasAttachments) {
    const mixed = boundary();
    const parts: string[] = [
      `Content-Type: multipart/mixed; boundary="${mixed}"`,
      "",
    ];
    if (htmlBody) {
      parts.push(`--${mixed}`, buildAlternative(textBody, htmlBody));
    } else {
      parts.push(`--${mixed}`, buildTextPart(textBody));
    }
    for (const attachment of input.attachments) {
      parts.push(`--${mixed}`, buildAttachmentPart(attachment));
    }
    parts.push(`--${mixed}--`);
    body = parts.join("\r\n");
  } else if (htmlBody) {
    body = buildAlternative(textBody, htmlBody);
  } else {
    body = [
      'Content-Type: text/plain; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrapBase64(Buffer.from(textBody, "utf8").toString("base64")),
    ].join("\r\n");
  }

  return `${headers.join("\r\n")}\r\n\r\n${body}`;
}

export function encodeMimeForGmailApi(rawMime: string): string {
  return encodeBase64Url(rawMime);
}
