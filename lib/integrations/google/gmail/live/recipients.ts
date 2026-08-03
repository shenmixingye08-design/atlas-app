/**
 * Recipient validation — fail closed on injection / empty / invalid email.
 */

import type { GmailResolvedRecipients } from "./types";

const MAX_RECIPIENTS = 50;
const EMAIL_RE =
  /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

function hasHeaderInjection(value: string): boolean {
  return /[\r\n]/.test(value) || /%0[ad]/i.test(value);
}

function normalizeOne(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (hasHeaderInjection(trimmed)) {
    throw new Error("gmail invalid recipient: header/CRLF injection");
  }
  // Strip display name wrappers: "Name <email@x.com>"
  const angle = trimmed.match(/<([^>]+)>$/);
  const email = (angle?.[1] ?? trimmed).trim().toLowerCase();
  if (!EMAIL_RE.test(email)) {
    throw new Error(`gmail invalid recipient: ${email}`);
  }
  return email;
}

function parseList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === "string")
      .flatMap((item) => item.split(/[,;]/));
  }
  if (typeof value === "string") {
    return value.split(/[,;]/);
  }
  return [];
}

export function resolveGmailRecipients(input: {
  to: unknown;
  cc?: unknown;
  bcc?: unknown;
  selfEmail?: string | null;
}): GmailResolvedRecipients {
  const warnings: string[] = [];
  const toRaw = parseList(input.to);
  const ccRaw = parseList(input.cc);
  const bccRaw = parseList(input.bcc);

  const to: string[] = [];
  const cc: string[] = [];
  const bcc: string[] = [];
  const seen = new Set<string>();

  for (const raw of toRaw) {
    const email = normalizeOne(raw);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    to.push(email);
  }

  if (to.length === 0) {
    throw new Error("gmail invalid recipient: to is required");
  }

  for (const raw of ccRaw) {
    const email = normalizeOne(raw);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    cc.push(email);
  }

  for (const raw of bccRaw) {
    const email = normalizeOne(raw);
    if (!email) continue;
    if (seen.has(email)) continue;
    seen.add(email);
    bcc.push(email);
  }

  const total = to.length + cc.length + bcc.length;
  if (total > MAX_RECIPIENTS) {
    throw new Error(
      `gmail invalid recipient: max ${MAX_RECIPIENTS} recipients exceeded`,
    );
  }

  const self = input.selfEmail?.trim().toLowerCase() ?? null;
  if (self && to.includes(self) && to.length === 1 && cc.length === 0 && bcc.length === 0) {
    warnings.push("self_only_recipient");
  }

  return { to, cc, bcc, warnings };
}

export function formatAddressList(addresses: string[]): string {
  return addresses.join(", ");
}
