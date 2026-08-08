import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import {
  getOAuthEncryptionKeyVersion,
  listAvailableOAuthKeyVersions,
  requireOAuthEncryptionKey,
} from "./config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Wire format (self-describing, never looks like an OAuth token):
 * enc:v{version}:{base64(iv)}:{base64(authTag)}:{base64(ciphertext)}
 */
const PAYLOAD_RE =
  /^enc:v(\d+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+):([A-Za-z0-9+/=]+)$/;

export type EncryptedOAuthSecret = {
  ciphertext: string;
  keyVersion: number;
};

export function isEncryptedOAuthPayload(value: string): boolean {
  return PAYLOAD_RE.test(value.trim());
}

export function parseEncryptedOAuthPayload(value: string): {
  keyVersion: number;
  iv: Buffer;
  authTag: Buffer;
  data: Buffer;
} {
  const match = value.trim().match(PAYLOAD_RE);
  if (!match) {
    throw new Error("Invalid encrypted OAuth payload");
  }
  const keyVersion = Number.parseInt(match[1]!, 10);
  return {
    keyVersion,
    iv: Buffer.from(match[2]!, "base64"),
    authTag: Buffer.from(match[3]!, "base64"),
    data: Buffer.from(match[4]!, "base64"),
  };
}

export function encryptOAuthSecret(
  plaintext: string,
  keyVersion = getOAuthEncryptionKeyVersion(),
): EncryptedOAuthSecret {
  if (!plaintext) {
    throw new Error("Cannot encrypt empty OAuth secret");
  }
  const key = requireOAuthEncryptionKey(keyVersion);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  const ciphertext = [
    "enc",
    `v${keyVersion}`,
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
  return { ciphertext, keyVersion };
}

export function decryptOAuthSecret(payload: string): string {
  const parsed = parseEncryptedOAuthPayload(payload);
  const key = requireOAuthEncryptionKey(parsed.keyVersion);
  const decipher = createDecipheriv(ALGORITHM, key, parsed.iv);
  decipher.setAuthTag(parsed.authTag);
  const decrypted = Buffer.concat([
    decipher.update(parsed.data),
    decipher.final(),
  ]);
  return decrypted.toString("utf8");
}

/**
 * Decode a DB column that may be:
 * - versioned ciphertext (`enc:v…`)
 * - legacy plaintext OAuth token
 */
export function decodeStoredOAuthSecret(value: string): {
  plaintext: string;
  wasPlaintext: boolean;
  keyVersion: number | null;
} {
  if (isEncryptedOAuthPayload(value)) {
    const parsed = parseEncryptedOAuthPayload(value);
    return {
      plaintext: decryptOAuthSecret(value),
      wasPlaintext: false,
      keyVersion: parsed.keyVersion,
    };
  }
  return {
    plaintext: value,
    wasPlaintext: true,
    keyVersion: null,
  };
}

/**
 * Re-encrypt ciphertext (or plaintext) under the active key version.
 * Used for key rotation and lazy plaintext migration.
 */
export function rotateOAuthSecretToCurrent(value: string): EncryptedOAuthSecret {
  const decoded = decodeStoredOAuthSecret(value);
  return encryptOAuthSecret(decoded.plaintext);
}

/**
 * Try decrypt with every available key version (tamper / wrong-key detection).
 * Prefer decryptOAuthSecret when the version prefix is trusted.
 */
export function tryDecryptWithAnyAvailableKey(payload: string): string | null {
  if (!isEncryptedOAuthPayload(payload)) return null;
  try {
    return decryptOAuthSecret(payload);
  } catch {
    // Version prefix may be wrong after misconfiguration — try others.
  }
  const parsed = parseEncryptedOAuthPayload(payload);
  for (const version of listAvailableOAuthKeyVersions()) {
    if (version === parsed.keyVersion) continue;
    try {
      const key = requireOAuthEncryptionKey(version);
      const decipher = createDecipheriv(ALGORITHM, key, parsed.iv);
      decipher.setAuthTag(parsed.authTag);
      const decrypted = Buffer.concat([
        decipher.update(parsed.data),
        decipher.final(),
      ]);
      return decrypted.toString("utf8");
    } catch {
      // continue
    }
  }
  return null;
}
