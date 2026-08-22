/**
 * Safe WordPress encryption-key configuration probe.
 * Never returns or logs the key material.
 */

import { isAtlasProduction } from "@/lib/runtime/is-production";

import { WP_MISSING_ENCRYPTION_KEY_MESSAGE } from "./errors";

export const WORDPRESS_ENCRYPTION_KEY_ENV =
  "ATLAS_WORDPRESS_CREDENTIALS_ENCRYPTION_KEY";

export const WORDPRESS_ENCRYPTION_EXPECTED_BYTES = 32;

export type WordPressEncryptionEncoding =
  | "hex_64"
  | "base64_32"
  | "invalid"
  | "missing";

export type WordPressEncryptionConfigProbe = {
  envName: typeof WORDPRESS_ENCRYPTION_KEY_ENV;
  requiredInProduction: true;
  expectedByteLength: typeof WORDPRESS_ENCRYPTION_EXPECTED_BYTES;
  acceptedEncodings: ["hex_64_chars", "base64_32_bytes"];
  configured: boolean;
  encoding: WordPressEncryptionEncoding;
  byteLength: number | null;
  productionFailClosed: boolean;
  usesDevFallback: boolean;
  ok: boolean;
  error: string | null;
};

function inspectRawKey(raw: string | undefined): {
  encoding: WordPressEncryptionEncoding;
  byteLength: number | null;
} {
  if (!raw) return { encoding: "missing", byteLength: null };
  if (/^[0-9a-fA-F]{64}$/.test(raw)) {
    return { encoding: "hex_64", byteLength: 32 };
  }
  try {
    const fromB64 = Buffer.from(raw, "base64");
    if (fromB64.length === 32) {
      return { encoding: "base64_32", byteLength: 32 };
    }
  } catch {
    // fall through
  }
  return { encoding: "invalid", byteLength: null };
}

/**
 * Inspect configuration only. Does not decrypt credentials or emit the key.
 */
export function probeWordPressEncryptionConfig(
  env: Record<string, string | undefined> = process.env,
): WordPressEncryptionConfigProbe {
  const raw = env[WORDPRESS_ENCRYPTION_KEY_ENV]?.trim();
  const inspected = inspectRawKey(raw);
  const production = isAtlasProduction();
  const configured =
    inspected.encoding === "hex_64" || inspected.encoding === "base64_32";
  const usesDevFallback = !production && !configured;
  const productionFailClosed = production && !configured;
  const ok = configured || usesDevFallback;
  return {
    envName: WORDPRESS_ENCRYPTION_KEY_ENV,
    requiredInProduction: true,
    expectedByteLength: WORDPRESS_ENCRYPTION_EXPECTED_BYTES,
    acceptedEncodings: ["hex_64_chars", "base64_32_bytes"],
    configured,
    encoding: inspected.encoding,
    byteLength: inspected.byteLength,
    productionFailClosed,
    usesDevFallback,
    ok,
    error: productionFailClosed ? WP_MISSING_ENCRYPTION_KEY_MESSAGE : null,
  };
}
