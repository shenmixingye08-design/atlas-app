import { createHash } from "node:crypto";

import type { SideEffectContext } from "./types";

function normalize(value: string | null | undefined): string {
  return (value ?? "").trim();
}

export function fingerprintDestination(destination: string): string {
  const raw = normalize(destination).toLowerCase();
  if (!raw) return "none";
  return createHash("sha256").update(raw).digest("hex").slice(0, 32);
}

/**
 * Phase 5: when occurrenceKey is present, omit runId so safe-retry / crash
 * reclaim with a new or resumed run cannot create a second provider resource.
 * Legacy v1 keys (include runId) remain resolvable via ensureSideEffectClaim.
 */
export function buildSideEffectIdempotencyKey(
  input: SideEffectContext,
): string {
  const occurrenceKey = normalize(input.occurrenceKey);
  const hasOccurrence = occurrenceKey.length > 0;
  const parts = [
    "sef",
    hasOccurrence ? "v2" : "v1",
    normalize(input.userId),
    normalize(input.provider),
    normalize(input.actionType),
    fingerprintDestination(input.destination),
    normalize(input.automationId),
    hasOccurrence ? "" : normalize(input.runId),
    occurrenceKey,
    normalize(input.discriminator),
  ];
  const material = parts.join("|");
  const digest = createHash("sha256").update(material).digest("hex").slice(0, 40);
  return `sef_${digest}`;
}

/** Pre-Phase-5 key shape (always includes runId). Used for claim fallback. */
export function buildLegacySideEffectIdempotencyKey(
  input: SideEffectContext,
): string {
  const parts = [
    "sef",
    "v1",
    normalize(input.userId),
    normalize(input.provider),
    normalize(input.actionType),
    fingerprintDestination(input.destination),
    normalize(input.automationId),
    normalize(input.runId),
    normalize(input.occurrenceKey),
    normalize(input.discriminator),
  ];
  const material = parts.join("|");
  const digest = createHash("sha256").update(material).digest("hex").slice(0, 40);
  return `sef_${digest}`;
}

export function buildSideEffectClaimId(idempotencyKey: string, userId: string): string {
  return createHash("sha256")
    .update(`${normalize(userId)}|${normalize(idempotencyKey)}`)
    .digest("hex")
    .slice(0, 32);
}
