import { isAtlasProduction } from "@/lib/runtime/is-production";

/**
 * Google account OAuth scopes — Gmail / Calendar / Drive.file (+ profile).
 * Drive uses drive.file (app-created files) — not full drive.
 */
export const GOOGLE_ACCOUNT_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.modify",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/drive.file",
] as const;

/** Least-privilege Drive upload scope (preferred). */
export const GOOGLE_DRIVE_FILE_SCOPE =
  "https://www.googleapis.com/auth/drive.file" as const;

/** Legacy full Drive scope still accepted for already-connected accounts. */
export const GOOGLE_DRIVE_FULL_SCOPE =
  "https://www.googleapis.com/auth/drive" as const;

const GOOGLE_ENCRYPTION_ENV_KEYS = [
  "ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY",
  "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
] as const;

/**
 * 32-byte key as hex (64 chars) or base64.
 * Required to persist Google OAuth tokens at rest in production.
 */
export function getGoogleCredentialsEncryptionKeyBytes(): Buffer | null {
  for (const envKey of GOOGLE_ENCRYPTION_ENV_KEYS) {
    const raw = process.env[envKey]?.trim();
    if (!raw) continue;
    if (/^[0-9a-fA-F]{64}$/.test(raw)) {
      return Buffer.from(raw, "hex");
    }
    try {
      const fromB64 = Buffer.from(raw, "base64");
      if (fromB64.length === 32) return fromB64;
    } catch {
      // try next
    }
  }
  return null;
}

export function isGoogleCredentialsEncryptionConfigured(): boolean {
  return getGoogleCredentialsEncryptionKeyBytes() !== null;
}

export function requireGoogleCredentialsEncryptionKey(): Buffer {
  const key = getGoogleCredentialsEncryptionKeyBytes();
  if (key) return key;

  if (isAtlasProduction()) {
    throw new Error(
      "ATLAS_GOOGLE_CREDENTIALS_ENCRYPTION_KEY (or ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY) must be configured in production",
    );
  }

  // Dev/test fallback only — never used when NODE_ENV/VERCEL_ENV is production.
  return Buffer.from("atlas-google-dev-only-key-32b!!", "utf8");
}

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

  if (isAtlasProduction()) {
    throw new Error(
      "GOOGLE_REDIRECT_URI (or GOOGLE_ACCOUNT_REDIRECT_URI) must be set in production. Do not derive redirect_uri from the request Host.",
    );
  }

  return `${requestOrigin.replace(/\/$/, "")}/api/external-services/google/oauth/callback`;
}
