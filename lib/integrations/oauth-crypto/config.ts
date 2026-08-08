import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

/** Current (active) encryption key — 32 bytes as hex64 or base64. */
export const OAUTH_ENCRYPTION_KEY_ENV = "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY";

/** Integer key version used when encrypting new secrets (default 1). */
export const OAUTH_ENCRYPTION_KEY_VERSION_ENV =
  "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION";

/**
 * Previous keys for decrypt / rotation:
 * ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V{n}
 */
export function oauthEncryptionKeyEnvForVersion(version: number): string {
  if (version <= 0) {
    throw new Error("OAuth encryption key version must be positive");
  }
  return `ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V${version}`;
}

export const OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE =
  "ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY is not configured";

function parseKeyBytes(raw: string): Buffer | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;

  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  try {
    const fromB64 = Buffer.from(trimmed, "base64");
    if (fromB64.length === 32) return fromB64;
  } catch {
    // fall through
  }

  return null;
}

export function getOAuthEncryptionKeyVersion(): number {
  const raw = process.env[OAUTH_ENCRYPTION_KEY_VERSION_ENV]?.trim();
  if (!raw) return 1;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed) || parsed < 1) return 1;
  return parsed;
}

/**
 * Resolve key bytes for a version.
 * Current version reads ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY (preferred)
 * and falls back to ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V{n}.
 */
export function getOAuthEncryptionKeyBytes(version?: number): Buffer | null {
  const target = version ?? getOAuthEncryptionKeyVersion();
  const currentVersion = getOAuthEncryptionKeyVersion();

  if (target === currentVersion) {
    const primary = process.env[OAUTH_ENCRYPTION_KEY_ENV];
    if (primary) {
      const parsed = parseKeyBytes(primary);
      if (parsed) return parsed;
    }
  }

  const versioned = process.env[oauthEncryptionKeyEnvForVersion(target)];
  if (versioned) {
    const parsed = parseKeyBytes(versioned);
    if (parsed) return parsed;
  }

  // Allow current key env to decrypt version 1 when version env omitted.
  if (target === 1 && currentVersion === 1) {
    const primary = process.env[OAUTH_ENCRYPTION_KEY_ENV];
    if (primary) return parseKeyBytes(primary);
  }

  return null;
}

export function isOAuthEncryptionConfigured(): boolean {
  return getOAuthEncryptionKeyBytes(getOAuthEncryptionKeyVersion()) !== null;
}

/**
 * Production: missing key throws (fail-closed).
 * Non-production: deterministic 32-byte key for local/tests only.
 */
export function requireOAuthEncryptionKey(version?: number): Buffer {
  const target = version ?? getOAuthEncryptionKeyVersion();
  const key = getOAuthEncryptionKeyBytes(target);
  if (key) return key;

  if (isAtlasProduction()) {
    throw new Error(OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE);
  }

  // Dev/test only — never used when isAtlasProduction() is true.
  return Buffer.from("atlas-oauth-dev-only-key-32b!!", "utf8");
}

/** All known key versions that have material available (for rotation scans). */
export function listAvailableOAuthKeyVersions(): number[] {
  const versions = new Set<number>();
  const current = getOAuthEncryptionKeyVersion();
  if (getOAuthEncryptionKeyBytes(current)) versions.add(current);

  for (let v = 1; v <= Math.max(current + 5, 16); v += 1) {
    if (getOAuthEncryptionKeyBytes(v)) versions.add(v);
  }
  return [...versions].sort((a, b) => a - b);
}
