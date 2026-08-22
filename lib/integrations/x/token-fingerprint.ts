import { createHash } from "node:crypto";

/**
 * Short SHA-256 of a secret for cross-stage comparison.
 * Never log the raw value — only this fingerprint.
 */
export function fingerprintSecret(
  value: string | null | undefined,
): string | null {
  if (!value) return null;
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}
