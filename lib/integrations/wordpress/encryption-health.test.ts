import { afterEach, describe, expect, it, vi } from "vitest";

import {
  WORDPRESS_ENCRYPTION_KEY_ENV,
  probeWordPressEncryptionConfig,
} from "./encryption-health";

describe("WordPress encryption key configuration", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("accepts 32-byte hex and never echoes the key", () => {
    const hex = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    const probe = probeWordPressEncryptionConfig({
      [WORDPRESS_ENCRYPTION_KEY_ENV]: hex,
    });
    expect(probe.configured).toBe(true);
    expect(probe.encoding).toBe("hex_64");
    expect(probe.byteLength).toBe(32);
    expect(probe.ok).toBe(true);
    expect(JSON.stringify(probe)).not.toContain(hex);
    expect(probe.envName).toBe(WORDPRESS_ENCRYPTION_KEY_ENV);
  });

  it("accepts 32-byte base64", () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const probe = probeWordPressEncryptionConfig({
      [WORDPRESS_ENCRYPTION_KEY_ENV]: key,
    });
    expect(probe.encoding).toBe("base64_32");
    expect(probe.configured).toBe(true);
    expect(JSON.stringify(probe)).not.toContain(key);
  });

  it("fail-closes in production when the env is missing (no default key)", () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("VERCEL_ENV", "production");
    const probe = probeWordPressEncryptionConfig({});
    expect(probe.configured).toBe(false);
    expect(probe.encoding).toBe("missing");
    expect(probe.productionFailClosed).toBe(true);
    expect(probe.usesDevFallback).toBe(false);
    expect(probe.ok).toBe(false);
    expect(probe.error).toMatch(/暗号化キー/);
  });

  it("rejects invalid encoding instead of inventing a key", () => {
    const probe = probeWordPressEncryptionConfig({
      [WORDPRESS_ENCRYPTION_KEY_ENV]: "too-short",
    });
    expect(probe.encoding).toBe("invalid");
    expect(probe.configured).toBe(false);
  });
});
