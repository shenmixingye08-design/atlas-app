import "server-only";

import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

import { requireDropboxCredentialsEncryptionKey } from "./config";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 12;

/**
 * Encrypt Dropbox OAuth token material for at-rest storage.
 * Format: base64(iv):base64(authTag):base64(ciphertext)
 * Never log plaintext tokens.
 */
export function encryptDropboxSecret(plaintext: string): string {
  const key = requireDropboxCredentialsEncryptionKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();
  return [
    iv.toString("base64"),
    authTag.toString("base64"),
    encrypted.toString("base64"),
  ].join(":");
}

export function decryptDropboxSecret(payload: string): string {
  const key = requireDropboxCredentialsEncryptionKey();
  const parts = payload.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid Dropbox encrypted payload");
  }

  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return decrypted.toString("utf8");
}

/** Detect AES-GCM payload shape used by encryptDropboxSecret. */
export function looksLikeDropboxEncryptedSecret(value: string): boolean {
  const parts = value.split(":");
  if (parts.length !== 3) return false;
  return parts.every((part) => part.length > 0);
}
