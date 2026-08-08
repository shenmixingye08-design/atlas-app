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
 * Stable side-effect idempotency key.
 * Same logical execution (retry/reclaim) → same key.
 * Does NOT include wall-clock / random values.
 */
export function buildSideEffectIdempotencyKey(
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
