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

export function getXRedirectUri(requestOrigin: string): string {
  const configured =
    process.env.X_REDIRECT_URI?.trim() ||
    process.env.X_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${requestOrigin.replace(/\/$/, "")}/api/external-services/x/oauth/callback`;
}

export function buildXBasicAuthHeader(): string {
  const credentials = `${getXClientId()}:${getXClientSecret()}`;
  return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
}
