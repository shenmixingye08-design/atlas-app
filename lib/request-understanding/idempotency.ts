import { createHash } from "crypto";

import type { UnderstandInput } from "./types";

/** Stable key for duplicate request prevention (no raw PII in logs). */
export function buildRequestIdempotencyKey(input: {
  userId: string;
  assignment: string;
  attachmentIds?: string[];
  preferredFormat?: string | null;
  clientKey?: string | null;
}): string {
  if (input.clientKey?.trim()) {
    return `client:${input.clientKey.trim()}`;
  }

  const normalized = input.assignment.trim().replace(/\s+/g, " ").slice(0, 500);
  const attachments = (input.attachmentIds ?? []).slice().sort().join(",");
  const payload = [
    input.userId,
    normalized,
    attachments,
    input.preferredFormat ?? "auto",
  ].join("|");

  const hash = createHash("sha256").update(payload).digest("hex").slice(0, 24);
  return `ru:${hash}`;
}

const recentKeys = new Map<string, number>();
const TTL_MS = 60_000;

/** In-process duplicate guard (work-jobs layer may also persist). */
export function claimIdempotencyKey(key: string, now = Date.now()): boolean {
  for (const [k, ts] of recentKeys) {
    if (now - ts > TTL_MS) recentKeys.delete(k);
  }
  const existing = recentKeys.get(key);
  if (existing && now - existing < TTL_MS) return false;
  recentKeys.set(key, now);
  return true;
}

export function idempotencyKeyFromUnderstandInput(
  userId: string,
  input: UnderstandInput,
): string {
  return buildRequestIdempotencyKey({
    userId,
    assignment: input.assignment,
    attachmentIds: (input.attachments ?? [])
      .map((a) => a.id)
      .filter((id): id is string => Boolean(id)),
    preferredFormat: input.preferredFormat,
    clientKey: input.idempotencyKey,
  });
}
