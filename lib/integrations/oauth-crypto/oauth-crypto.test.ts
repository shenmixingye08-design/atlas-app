import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  decodeOAuthTokenPairFromStorage,
  decodeStoredOAuthSecret,
  decryptOAuthSecret,
  encodeOAuthTokenPairForStorage,
  encryptOAuthSecret,
  isEncryptedOAuthPayload,
  isOAuthEncryptionConfigured,
  OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE,
  redactOAuthSecrets,
  rotateOAuthSecretToCurrent,
} from "./index";

const KEY_V1 =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const KEY_V2 =
  "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";

describe("P0-02 oauth-crypto core", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY", KEY_V1);
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION", "1");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1", KEY_V1);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("A/B: encrypt stores ciphertext without plaintext; decrypt round-trips", () => {
    const secret = "ya29.google-access-token-plaintext-value";
    const { ciphertext, keyVersion } = encryptOAuthSecret(secret);
    expect(keyVersion).toBe(1);
    expect(isEncryptedOAuthPayload(ciphertext)).toBe(true);
    expect(ciphertext).not.toContain(secret);
    expect(ciphertext.startsWith("enc:v1:")).toBe(true);
    expect(decryptOAuthSecret(ciphertext)).toBe(secret);
  });

  it("C: production without key refuses encode (no plaintext fallback)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    delete process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY;
    delete process.env.ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1;
    expect(isOAuthEncryptionConfigured()).toBe(false);
    expect(() =>
      encodeOAuthTokenPairForStorage({
        accessToken: "access-plain",
        refreshToken: "refresh-plain",
      }),
    ).toThrow(OAUTH_MISSING_ENCRYPTION_KEY_MESSAGE);
  });

  it("D: tampered ciphertext fails decrypt", () => {
    const { ciphertext } = encryptOAuthSecret("refresh-token-value");
    const parts = ciphertext.split(":");
    // Flip last char of ciphertext segment
    const last = parts[4]!;
    parts[4] = `${last.slice(0, -2)}aa`;
    const tampered = parts.join(":");
    expect(() => decryptOAuthSecret(tampered)).toThrow();
  });

  it("E: wrong key fails decrypt", () => {
    const { ciphertext } = encryptOAuthSecret("secret-token");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY", KEY_V2);
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1", KEY_V2);
    expect(() => decryptOAuthSecret(ciphertext)).toThrow();
  });

  it("J: redact strips token fields and ciphertext from log payloads", () => {
    const { ciphertext } = encryptOAuthSecret("ya29.secret");
    const redacted = redactOAuthSecrets({
      access_token: "ya29.should-not-appear",
      refreshToken: "refresh-should-not-appear",
      nested: { authorization: "Bearer abc.def.ghi" },
      note: `payload ${ciphertext}`,
      error: new Error(`failed with ya29.leak-token-value-here`),
    }) as Record<string, unknown>;

    const serialized = JSON.stringify(redacted);
    expect(serialized).not.toContain("ya29.should-not-appear");
    expect(serialized).not.toContain("refresh-should-not-appear");
    expect(serialized).not.toContain(ciphertext);
    expect(serialized).not.toContain("ya29.leak-token-value-here");
    expect(redacted.access_token).toBe("[redacted]");
  });

  it("K: legacy plaintext decode marks needsReencrypt and can rotate", () => {
    const legacy = "legacy-plain-refresh-token";
    const decoded = decodeStoredOAuthSecret(legacy);
    expect(decoded.wasPlaintext).toBe(true);
    expect(decoded.plaintext).toBe(legacy);

    const rotated = rotateOAuthSecretToCurrent(legacy);
    expect(isEncryptedOAuthPayload(rotated.ciphertext)).toBe(true);
    expect(decryptOAuthSecret(rotated.ciphertext)).toBe(legacy);
    expect(rotated.ciphertext).not.toContain(legacy);
  });

  it("L: key rotation decrypts with old key and re-encrypts with new version", () => {
    const secret = "rotate-me-token";
    const v1 = encryptOAuthSecret(secret, 1);
    expect(v1.keyVersion).toBe(1);

    // Activate v2 while keeping v1 available for decrypt.
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_VERSION", "2");
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY", KEY_V2);
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V2", KEY_V2);
    vi.stubEnv("ATLAS_OAUTH_CREDENTIALS_ENCRYPTION_KEY_V1", KEY_V1);

    expect(decryptOAuthSecret(v1.ciphertext)).toBe(secret);
    const rotated = rotateOAuthSecretToCurrent(v1.ciphertext);
    expect(rotated.keyVersion).toBe(2);
    expect(rotated.ciphertext.startsWith("enc:v2:")).toBe(true);
    expect(decryptOAuthSecret(rotated.ciphertext)).toBe(secret);
  });

  it("token pair encode/decode round-trip", () => {
    const encoded = encodeOAuthTokenPairForStorage({
      accessToken: "access-abc",
      refreshToken: "refresh-xyz",
    });
    expect(encoded.accessTokenCiphertext).not.toContain("access-abc");
    expect(encoded.refreshTokenCiphertext).not.toContain("refresh-xyz");

    const decoded = decodeOAuthTokenPairFromStorage({
      accessToken: encoded.accessTokenCiphertext,
      refreshToken: encoded.refreshTokenCiphertext,
    });
    expect(decoded.accessToken).toBe("access-abc");
    expect(decoded.refreshToken).toBe("refresh-xyz");
    expect(decoded.needsReencrypt).toBe(false);
  });
});
