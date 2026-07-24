import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

export const ATLAS_BUSINESS_PROFILE_ENCRYPTION_KEY =
  "ATLAS_BUSINESS_PROFILE_ENCRYPTION_KEY" as const;

const DEV_ONLY_KEY = "atlas-business-profile-dev-key!!";

let warnedDevFallback = false;

/**
 * 32-byte key as hex (64 chars) or base64.
 * Required to persist business profile secrets at rest.
 */
export function getBusinessProfileEncryptionKeyBytes(): Buffer | null {
  const raw = process.env[ATLAS_BUSINESS_PROFILE_ENCRYPTION_KEY]?.trim();
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

export function isBusinessProfileEncryptionConfigured(): boolean {
  return getBusinessProfileEncryptionKeyBytes() !== null;
}

export function requireBusinessProfileEncryptionKey(): Buffer {
  const key = getBusinessProfileEncryptionKeyBytes();
  if (key) return key;

  if (isAtlasProduction()) {
    throw new Error("業務プロフィールの暗号化キーが未設定です");
  }

  if (!warnedDevFallback) {
    console.warn(
      "[BusinessProfile] DEV ONLY fallback encryption key in use. Set ATLAS_BUSINESS_PROFILE_ENCRYPTION_KEY for persistent secrets.",
    );
    warnedDevFallback = true;
  }

  return Buffer.from(DEV_ONLY_KEY, "utf8");
}
