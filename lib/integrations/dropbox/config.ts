/** Dropbox OAuth 2.0 configuration (server-only). */
export const DROPBOX_OAUTH_SCOPES = [
  "account_info.read",
  "files.content.read",
  "files.content.write",
  "sharing.write",
  "sharing.read",
] as const;

export const DROPBOX_OAUTH_AUTHORIZE_URL =
  "https://www.dropbox.com/oauth2/authorize";

export const DROPBOX_OAUTH_TOKEN_URL =
  "https://api.dropboxapi.com/oauth2/token";

export const DROPBOX_API_BASE = "https://api.dropboxapi.com/2";

export const DROPBOX_CONTENT_BASE = "https://content.dropboxapi.com/2";

export const DROPBOX_ACCOUNT_URL =
  "https://api.dropboxapi.com/2/users/get_current_account";

export function getDropboxAppKey(): string {
  const value =
    process.env.DROPBOX_APP_KEY?.trim() ||
    process.env.DROPBOX_CLIENT_ID?.trim();
  if (!value) {
    throw new Error(
      "DROPBOX_APP_KEY is not configured. Add it to .env.local to connect Dropbox.",
    );
  }
  return value;
}

export function getDropboxAppSecret(): string {
  const value =
    process.env.DROPBOX_APP_SECRET?.trim() ||
    process.env.DROPBOX_CLIENT_SECRET?.trim();
  if (!value) {
    throw new Error(
      "DROPBOX_APP_SECRET is not configured. Add it to .env.local to connect Dropbox.",
    );
  }
  return value;
}

export function getDropboxRedirectUri(requestOrigin: string): string {
  const configured =
    process.env.DROPBOX_REDIRECT_URI?.trim() ||
    process.env.DROPBOX_OAUTH_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${requestOrigin.replace(/\/$/, "")}/api/external-services/dropbox/oauth/callback`;
}

export function buildDropboxBasicAuthHeader(): string {
  const credentials = `${getDropboxAppKey()}:${getDropboxAppSecret()}`;
  return `Basic ${Buffer.from(credentials, "utf8").toString("base64")}`;
}
