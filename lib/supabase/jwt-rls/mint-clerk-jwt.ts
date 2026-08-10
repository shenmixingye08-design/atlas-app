import { createHmac } from "crypto";

import type { MintClerkSupabaseJwtInput } from "./types";

function base64UrlJson(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

/**
 * Mint a short-lived Supabase-compatible JWT for a Clerk userId.
 * Claims: role=authenticated, sub=<Clerk userId>, aud=authenticated.
 * RLS policies use auth.jwt()->>'sub' to match user_id columns.
 */
export function mintClerkSupabaseJwt(input: MintClerkSupabaseJwtInput): string {
  const userId = input.userId?.trim();
  if (!userId) {
    throw new Error("clerk_user_id_required");
  }
  const secret = input.secret?.trim();
  if (!secret) {
    throw new Error("supabase_jwt_secret_required");
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const expiresInSec = Math.max(30, Math.min(input.expiresInSec ?? 120, 3600));
  const header = { alg: "HS256", typ: "JWT" };
  const payload = {
    role: "authenticated",
    sub: userId,
    aud: "authenticated",
    iss: "supabase",
    iat: nowSec,
    exp: nowSec + expiresInSec,
  };

  const signingInput = `${base64UrlJson(header)}.${base64UrlJson(payload)}`;
  const signature = createHmac("sha256", secret)
    .update(signingInput)
    .digest("base64url");
  return `${signingInput}.${signature}`;
}

/** Decode JWT payload without verifying (tests / diagnostics only). */
export function decodeJwtPayloadUnsafe(
  token: string,
): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  try {
    const json = Buffer.from(parts[1], "base64url").toString("utf8");
    const parsed = JSON.parse(json) as unknown;
    return parsed && typeof parsed === "object"
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
