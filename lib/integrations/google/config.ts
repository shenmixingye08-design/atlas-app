/** Google account OAuth scopes — Gmail, Calendar, Drive (+ profile). */
export const GOOGLE_ACCOUNT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.file",
] as const;

export const GOOGLE_OAUTH_AUTHORIZE_URL =
  "https://accounts.google.com/o/oauth2/v2/auth";

export const GOOGLE_OAUTH_TOKEN_URL = "https://oauth2.googleapis.com/token";

export const GOOGLE_USERINFO_URL =
  "https://www.googleapis.com/oauth2/v2/userinfo";

export function getGoogleClientId(): string {
  const value = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!value) {
    throw new Error(
      "GOOGLE_CLIENT_ID is not configured. Add it to .env.local to connect Google.",
    );
  }
  return value;
}

export function getGoogleClientSecret(): string {
  const value = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!value) {
    throw new Error(
      "GOOGLE_CLIENT_SECRET is not configured. Add it to .env.local to connect Google.",
    );
  }
  return value;
}

export function getGoogleAccountRedirectUri(requestOrigin: string): string {
  const configured =
    process.env.GOOGLE_REDIRECT_URI?.trim() ||
    process.env.GOOGLE_ACCOUNT_REDIRECT_URI?.trim();
  if (configured) return configured;
  return `${requestOrigin.replace(/\/$/, "")}/api/external-services/google/oauth/callback`;
}
