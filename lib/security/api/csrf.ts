import { createHmac, timingSafeEqual } from "crypto";

/**
 * Double-submit CSRF for cookie-authenticated mutating API requests.
 * Safe when Origin/Referer match the request host, or a valid CSRF header is present.
 */

function resolveCsrfSecret(): string {
  return (
    process.env.CSRF_SECRET?.trim() ||
    process.env.OAUTH_STATE_SECRET?.trim() ||
    process.env.CLERK_SECRET_KEY?.trim() ||
    ""
  );
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function createCsrfToken(userId: string): string {
  const secret = resolveCsrfSecret();
  if (!secret) {
    // Dev without secrets — token still deterministic per user for local tests.
    return `dev_${Buffer.from(userId).toString("base64url")}`;
  }
  const digest = createHmac("sha256", secret).update(userId).digest("base64url");
  return `csrf_${digest}`;
}

export function verifyCsrfToken(userId: string, token: string | null): boolean {
  if (!token) return false;
  const expected = createCsrfToken(userId);
  return safeEqual(expected, token);
}

function hostFromUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    return new URL(value).host.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Accept mutating requests when:
 * 1) Origin/Referer host matches request host (browser same-site), OR
 * 2) x-atlas-csrf matches HMAC token for the user.
 * Server-to-server (no Origin/Referer) with Clerk session still needs CSRF header
 * in production to reduce cross-site cookie abuse.
 */
export function assertCsrfForMutation(input: {
  request: Request;
  userId: string;
  requireHeaderInProduction?: boolean;
}): { ok: true } | { ok: false; reason: string } {
  const originHost = hostFromUrl(input.request.headers.get("origin"));
  const refererHost = hostFromUrl(input.request.headers.get("referer"));
  const requestHost = hostFromUrl(input.request.url);
  const sameSite =
    Boolean(requestHost) &&
    ((originHost !== null && originHost === requestHost) ||
      (refererHost !== null && refererHost === requestHost));

  if (sameSite) return { ok: true };

  const header =
    input.request.headers.get("x-atlas-csrf") ??
    input.request.headers.get("x-csrf-token");
  if (verifyCsrfToken(input.userId, header)) {
    return { ok: true };
  }

  const isProd =
    process.env.VERCEL_ENV === "production" ||
    process.env.NODE_ENV === "production";

  // Non-browser clients without Origin: allow in non-prod; require header in prod.
  if (!originHost && !refererHost) {
    if (!isProd || input.requireHeaderInProduction === false) {
      return { ok: true };
    }
    return { ok: false, reason: "CSRFトークンが必要です" };
  }

  return { ok: false, reason: "CSRF検証に失敗しました" };
}
