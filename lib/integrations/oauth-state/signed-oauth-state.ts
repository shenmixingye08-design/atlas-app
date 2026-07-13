import "server-only";

import { createHmac, randomUUID, timingSafeEqual } from "crypto";

const STATE_TTL_MS = 1000 * 60 * 10;

type SignedOAuthPayload = {
  sub: string;
  iat: number;
  exp: number;
  nonce: string;
  codeVerifier?: string;
};

function resolveOAuthStateSecret(): string {
  const dedicated = process.env.OAUTH_STATE_SECRET?.trim();
  if (dedicated) return dedicated;

  const clerk = process.env.CLERK_SECRET_KEY?.trim();
  if (clerk) return clerk;

  // Local/dev only — never sign CSRF state with provider client secrets in production.
  if (
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production"
  ) {
    return "";
  }

  return (
    process.env.GOOGLE_CLIENT_SECRET?.trim() ||
    process.env.DROPBOX_APP_SECRET?.trim() ||
    process.env.X_CLIENT_SECRET?.trim() ||
    ""
  );
}

function base64UrlEncode(value: string | Buffer): string {
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function base64UrlDecode(value: string): Buffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  return Buffer.from(padded + pad, "base64");
}

function sign(body: string, secret: string): string {
  return base64UrlEncode(
    createHmac("sha256", secret).update(body).digest(),
  );
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Durable OAuth CSRF state for multi-instance (Vercel).
 * HMAC-signed payload — no shared memory required across servers.
 */
export function createSignedOAuthState(
  subject: string,
  options?: { codeVerifier?: string },
): string {
  const secret = resolveOAuthStateSecret();
  if (!secret) {
    throw new Error(
      "OAuth state secret is not configured (set OAUTH_STATE_SECRET or CLERK_SECRET_KEY)",
    );
  }

  const now = Date.now();
  const payload: SignedOAuthPayload = {
    sub: subject,
    iat: now,
    exp: now + STATE_TTL_MS,
    nonce: randomUUID(),
    ...(options?.codeVerifier ? { codeVerifier: options.codeVerifier } : {}),
  };

  const body = base64UrlEncode(JSON.stringify(payload));
  return `${body}.${sign(body, secret)}`;
}

export function consumeSignedOAuthState(state: string): {
  subject: string;
  codeVerifier?: string;
} | null {
  const secret = resolveOAuthStateSecret();
  if (!secret || !state.includes(".")) return null;

  const [body, signature] = state.split(".");
  if (!body || !signature) return null;
  if (!safeEqual(signature, sign(body, secret))) return null;

  try {
    const payload = JSON.parse(
      base64UrlDecode(body).toString("utf8"),
    ) as SignedOAuthPayload;
    if (!payload?.sub || typeof payload.exp !== "number") return null;
    if (Date.now() > payload.exp) return null;
    return {
      subject: payload.sub,
      ...(payload.codeVerifier
        ? { codeVerifier: payload.codeVerifier }
        : {}),
    };
  } catch {
    return null;
  }
}
