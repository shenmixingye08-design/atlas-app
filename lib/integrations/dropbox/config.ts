import { isAtlasProduction } from "@/lib/runtime/is-production";

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

/** Least-privilege write scope required for Production Live upload. */
export const DROPBOX_FILES_CONTENT_WRITE_SCOPE =
  "files.content.write" as const;

const DROPBOX_ENCRYPTION_ENV_KEYS = [
  "ATLAS_DROPBOX_CREDENTIALS_ENCRYPTION_KEY",
  "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY",
] as const;

/**
 * 32-byte key as hex (64 chars) or base64.
 * Required to persist Dropbox OAuth tokens at rest in production.
 */
export function getDropboxCredentialsEncryptionKeyBytes(): Buffer | null {
  for (const envKey of DROPBOX_ENCRYPTION_ENV_KEYS) {
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

export function isDropboxCredentialsEncryptionConfigured(): boolean {
  return getDropboxCredentialsEncryptionKeyBytes() !== null;
}

export function requireDropboxCredentialsEncryptionKey(): Buffer {
  const key = getDropboxCredentialsEncryptionKeyBytes();
  if (key) return key;

  if (isAtlasProduction()) {
    throw new Error(
      "ATLAS_DROPBOX_CREDENTIALS_ENCRYPTION_KEY (or ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY) must be configured in production",
    );
  }

  return Buffer.from("atlas-dropbox-dev-only-key-32b!", "utf8");
}

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
