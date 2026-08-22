import { isAtlasProduction } from "@/lib/runtime/is-production";

/**
 * Canonical Production callback — matches X Developer Console.
 * Never derive this from the request Host.
 */
export const EXPECTED_X_PRODUCTION_REDIRECT_URI =
  "https://atlasapp.jp/api/external-services/x/oauth/callback";

/** X OAuth 2.0 configuration (server-only). */
export const X_OAUTH_SCOPES = [
  "tweet.read",
  "tweet.write",
  "users.read",
  "offline.access",
] as const;

export const X_OAUTH_AUTHORIZE_URL = "https://twitter.com/i/oauth2/authorize";

export const X_OAUTH_TOKEN_URL = "https://api.twitter.com/2/oauth2/token";

export const X_OAUTH_REVOKE_URL = "https://api.twitter.com/2/oauth2/revoke";

export const X_USERS_ME_URL =
  "https://api.twitter.com/2/users/me?user.fields=profile_image_url";

export function getXClientId(): string {
  const value = process.env.X_CLIENT_ID?.trim();
  if (!value) {
    throw new Error(
      "X_CLIENT_ID is not configured. Add it to .env.local to connect X.",
    );
  }
  return value;
}

export function getXClientSecret(): string {
  const value = process.env.X_CLIENT_SECRET?.trim();
  if (!value) {
    throw new Error(
      "X_CLIENT_SECRET is not configured. Add it to .env.local to connect X.",
    );
  }
  return value;
}

export function isXRedirectUriConfigured(
  env: Record<string, string | undefined> = process.env,
): boolean {
  return Boolean(
    env.X_REDIRECT_URI?.trim() || env.X_OAUTH_REDIRECT_URI?.trim(),
  );
}

export function getXRedirectUri(requestOrigin: string): string {
  const configured =
    process.env.X_REDIRECT_URI?.trim() ||
    process.env.X_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;

  // Vercel Production only: use the confirmed atlasapp.jp callback.
  // Do not derive redirect_uri from Host (open-redirect / app-mismatch risk).
  if (process.env.VERCEL_ENV === "production") {
    console.warn("[x-oauth] X_REDIRECT_URI unset; using canonical Production callback", {
      developerCode: "x_redirect_uri_defaulted",
      expectedRedirectHost: "atlasapp.jp",
    });
    return EXPECTED_X_PRODUCTION_REDIRECT_URI;
  }

  if (isAtlasProduction()) {
    throw new Error(
      "X_REDIRECT_URI (or X_OAUTH_REDIRECT_URI) must be set in production. Do not derive redirect_uri from the request Host.",
    );
  }

  return `${requestOrigin.replace(/\/$/, "")}/api/external-services/x/oauth/callback`;
}

export function buildXBasicAuthHeader(): string {
  const credentials = `${getXClientId()}:${getXClientSecret()}`;
  return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
}
