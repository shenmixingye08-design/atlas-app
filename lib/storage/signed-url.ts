/**
 * Short-lived signed download tokens (Clerk-bound).
 * Not a replacement for session download — additive regen path.
 */

import { createHmac, timingSafeEqual } from "node:crypto";

export const SIGNED_URL_TTL_MS = 60_000;

export type SignedDownloadToken = {
  artifactId: string;
  ownerId: string;
  exp: number;
  sig: string;
};

function secret(): string {
  return (
    process.env.ATLAS_STORAGE_SIGNING_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim() ||
    "atlas-dev-storage-signing"
  );
}

function signPayload(payload: string): string {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function createSignedDownloadToken(input: {
  artifactId: string;
  ownerId: string;
  ttlMs?: number;
  nowMs?: number;
}): SignedDownloadToken {
  const exp = (input.nowMs ?? Date.now()) + (input.ttlMs ?? SIGNED_URL_TTL_MS);
  const payload = `${input.artifactId}:${input.ownerId}:${exp}`;
  return {
    artifactId: input.artifactId,
    ownerId: input.ownerId,
    exp,
    sig: signPayload(payload),
  };
}

export function verifySignedDownloadToken(
  token: SignedDownloadToken,
  nowMs = Date.now(),
): { ok: true } | { ok: false; reason: "expired" | "invalid_sig" | "bad_payload" } {
  if (!token.artifactId || !token.ownerId || !token.exp || !token.sig) {
    return { ok: false, reason: "bad_payload" };
  }
  if (nowMs > token.exp) {
    return { ok: false, reason: "expired" };
  }
  const payload = `${token.artifactId}:${token.ownerId}:${token.exp}`;
  const expected = signPayload(payload);
  const a = Buffer.from(expected);
  const b = Buffer.from(token.sig);
  if (a.byteLength !== b.byteLength || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid_sig" };
  }
  return { ok: true };
}

/**
 * Regenerate a fresh token (old one remains invalid after expiry).
 */
export function regenerateSignedDownloadToken(
  previous: SignedDownloadToken,
  ttlMs = SIGNED_URL_TTL_MS,
): SignedDownloadToken {
  return createSignedDownloadToken({
    artifactId: previous.artifactId,
    ownerId: previous.ownerId,
    ttlMs,
  });
}

export function encodeSignedToken(token: SignedDownloadToken): string {
  return Buffer.from(JSON.stringify(token), "utf8").toString("base64url");
}

export function decodeSignedToken(raw: string): SignedDownloadToken | null {
  try {
    const json = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as SignedDownloadToken;
    if (
      typeof parsed.artifactId !== "string" ||
      typeof parsed.ownerId !== "string" ||
      typeof parsed.exp !== "number" ||
      typeof parsed.sig !== "string"
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
