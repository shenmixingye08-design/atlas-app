import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import { WP_MISSING_ENCRYPTION_KEY_MESSAGE } from "./errors";

const ENV_KEY = "ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY";

/**
 * 32-byte key as hex (64 chars) or base64.
 * Required to persist WordPress Application Passwords at rest.
 */
export function getWordPressEncryptionKeyBytes(): Buffer | null {
  const raw = process.env[ENV_KEY]?.trim();
  if (!raw) return null;

  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return Buffer.from(raw, "hex");
  }

  try {
    const fromB64 = Buffer.from(raw, "base64");
    if (fromB64.length === 32) return fromB64;
  } catch {
    // fall through
  }

  return null;
}

export function isWordPressEncryptionConfigured(): boolean {
  return getWordPressEncryptionKeyBytes() !== null;
}

/** Throws in production when encryption key is missing; returns null in non-prod. */
export function requireWordPressEncryptionKey(): Buffer {
  const key = getWordPressEncryptionKeyBytes();
  if (key) return key;

  if (isAtlasProduction()) {
    throw new Error(WP_MISSING_ENCRYPTION_KEY_MESSAGE);
  }

  // Dev/test fallback: deterministic 32-byte key (NOT for production).
  return Buffer.from("atlas-wp-dev-only-key-32bytes!!", "utf8");
}

export function normalizeWordPressSiteUrl(input: string): string {
  const trimmed = input.trim().replace(/\/+$/, "");
  if (!trimmed) {
    throw new Error("サイトURLが空です");
  }

  let withProtocol = trimmed;
  if (!/^https?:\/\//i.test(withProtocol)) {
    withProtocol = `https://${withProtocol}`;
  }

  let url: URL;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("無効なサイトURLです");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("http または https のURLのみ対応しています");
  }

  // Drop path/query/hash — site root only.
  return `${url.protocol}//${url.host}`;
}

/** WordPress Application Passwords often include spaces for readability. */
export function normalizeApplicationPassword(password: string): string {
  return password.replace(/\s+/g, "").trim();
}

export function buildWordPressRestBase(siteUrl: string): string {
  return `${normalizeWordPressSiteUrl(siteUrl)}/wp-json/wp/v2`;
}
