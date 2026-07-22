import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

const DEFAULT_TTL_SECONDS = 60 * 15;

function getSigningSecret(): string {
  return (
    process.env.ATTACHMENT_SIGNING_SECRET?.trim() ||
    process.env.OPENAI_API_KEY?.trim() ||
    "atlas-attachment-dev-secret"
  );
}

export type AttachmentSignedTokenPayload = {
  id: string;
  userId: string;
  exp: number;
};

export function createAttachmentSignedToken(input: {
  id: string;
  userId: string;
  ttlSeconds?: number;
}): { token: string; expiresAt: string } {
  const exp =
    Math.floor(Date.now() / 1000) + (input.ttlSeconds ?? DEFAULT_TTL_SECONDS);
  const payload = Buffer.from(
    JSON.stringify({ id: input.id, userId: input.userId, exp }),
  ).toString("base64url");
  const sig = createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");
  return {
    token: `${payload}.${sig}`,
    expiresAt: new Date(exp * 1000).toISOString(),
  };
}

export function verifyAttachmentSignedToken(
  token: string,
):
  | { ok: true; payload: AttachmentSignedTokenPayload }
  | { ok: false; reason: "invalid" | "expired" } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return { ok: false, reason: "invalid" };

  const expected = createHmac("sha256", getSigningSecret())
    .update(payload)
    .digest("base64url");

  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) {
    return { ok: false, reason: "invalid" };
  }

  try {
    const parsed = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf8"),
    ) as AttachmentSignedTokenPayload;
    if (
      typeof parsed.id !== "string" ||
      typeof parsed.userId !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return { ok: false, reason: "invalid" };
    }
    if (parsed.exp * 1000 < Date.now()) {
      return { ok: false, reason: "expired" };
    }
    return { ok: true, payload: parsed };
  } catch {
    return { ok: false, reason: "invalid" };
  }
}

export function buildSignedAttachmentUrl(input: {
  origin: string;
  id: string;
  userId: string;
  ttlSeconds?: number;
}): { url: string; expiresAt: string } {
  const { token, expiresAt } = createAttachmentSignedToken({
    id: input.id,
    userId: input.userId,
    ttlSeconds: input.ttlSeconds,
  });
  return {
    url: `${input.origin}/api/attachments/${encodeURIComponent(input.id)}?token=${encodeURIComponent(token)}`,
    expiresAt,
  };
}
