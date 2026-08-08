import "server-only";

import { isAtlasProduction } from "@/lib/runtime/is-production";

import {
  isOAuthEncryptionConfigured,
  OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE,
} from "./config";
import {
  decodeStoredOAuthSecret,
  encryptOAuthSecret,
  isEncryptedOAuthPayload,
  type EncryptedOAuthSecret,
} from "./crypto";

export type StoredTokenPair = {
  accessTokenCiphertext: string;
  refreshTokenCiphertext: string;
  keyVersion: number;
};

export type DecodedTokenPair = {
  accessToken: string;
  refreshToken: string;
  /** True when either column was legacy plaintext (needs re-encrypt persist). */
  needsReencrypt: boolean;
  keyVersion: number | null;
};

/**
 * Encrypt access + refresh for DB write.
 * Production without key: throws (fail-closed, never plaintext fallback).
 */
export function encodeOAuthTokenPairForStorage(input: {
  accessToken: string;
  refreshToken: string;
}): StoredTokenPair {
  if (!isOAuthEncryptionConfigured()) {
    if (isAtlasProduction()) {
      throw new Error(OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE);
    }
  }

  const access = encryptOAuthSecret(input.accessToken);
  const refresh = encryptOAuthSecret(input.refreshToken);
  if (access.keyVersion !== refresh.keyVersion) {
    throw new Error("OAuth token pair key version mismatch");
  }
  return {
    accessTokenCiphertext: access.ciphertext,
    refreshTokenCiphertext: refresh.ciphertext,
    keyVersion: access.keyVersion,
  };
}

/**
 * Decode DB columns. Supports legacy plaintext for lazy migration.
 * Production without key: throws when ciphertext present; plaintext refused.
 */
export function decodeOAuthTokenPairFromStorage(input: {
  accessToken: string;
  refreshToken: string;
}): DecodedTokenPair {
  const accessEncrypted = isEncryptedOAuthPayload(input.accessToken);
  const refreshEncrypted = isEncryptedOAuthPayload(input.refreshToken);

  if (!isOAuthEncryptionConfigured()) {
    if (isAtlasProduction()) {
      throw new Error(OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE);
    }
    // Dev without key: only allow reading legacy plaintext (never invent).
    if (accessEncrypted || refreshEncrypted) {
      throw new Error(OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE);
    }
    return {
      accessToken: input.accessToken,
      refreshToken: input.refreshToken,
      needsReencrypt: true,
      keyVersion: null,
    };
  }

  const access = decodeStoredOAuthSecret(input.accessToken);
  const refresh = decodeStoredOAuthSecret(input.refreshToken);

  return {
    accessToken: access.plaintext,
    refreshToken: refresh.plaintext,
    needsReencrypt: access.wasPlaintext || refresh.wasPlaintext,
    keyVersion: access.keyVersion ?? refresh.keyVersion,
  };
}

/** Assert a DB row value is ciphertext (for tests / migration checks). */
export function assertStoredTokenIsCiphertext(value: string): EncryptedOAuthSecret {
  if (!isEncryptedOAuthPayload(value)) {
    throw new Error("Expected encrypted OAuth payload, found plaintext");
  }
  const match = value.match(/^enc:v(\d+):/);
  return {
    ciphertext: value,
    keyVersion: Number.parseInt(match?.[1] ?? "0", 10),
  };
}
