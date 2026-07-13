import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStripePublishableKey,
  getStripeSecretDiagnostics,
  getStripeSecretKey,
  sanitizeStripeEnvValue,
} from "./config";
import { usesStripeLiveSecretKey } from "./production-guard";

describe("sanitizeStripeEnvValue", () => {
  it("returns null for empty or whitespace-only input", () => {
    expect(sanitizeStripeEnvValue(null)).toBeNull();
    expect(sanitizeStripeEnvValue(undefined)).toBeNull();
    expect(sanitizeStripeEnvValue("")).toBeNull();
    expect(sanitizeStripeEnvValue("   ")).toBeNull();
  });

  it("strips surrounding double and single quotes", () => {
    expect(sanitizeStripeEnvValue('"sk_live_abc"')).toBe("sk_live_abc");
    expect(sanitizeStripeEnvValue("'sk_live_abc'")).toBe("sk_live_abc");
  });

  it("strips UTF-8 BOM and surrounding whitespace", () => {
    expect(sanitizeStripeEnvValue("\uFEFFsk_live_abc")).toBe("sk_live_abc");
    expect(sanitizeStripeEnvValue("  sk_live_abc\r\n")).toBe("sk_live_abc");
    expect(sanitizeStripeEnvValue('\uFEFF  "sk_live_abc"  \r')).toBe(
      "sk_live_abc",
    );
  });
});

describe("getStripeSecretKey sanitization", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("treats quoted sk_live_ as live mode", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", '"sk_live_example"');
    expect(getStripeSecretKey()).toBe("sk_live_example");
    expect(usesStripeLiveSecretKey()).toBe(true);
  });

  it("treats BOM-prefixed sk_live_ as live mode", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "\uFEFFsk_live_example");
    expect(getStripeSecretKey()).toBe("sk_live_example");
    expect(usesStripeLiveSecretKey()).toBe(true);
  });

  it("keeps sk_test_ as non-live after sanitization", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "'sk_test_example'");
    expect(getStripeSecretKey()).toBe("sk_test_example");
    expect(usesStripeLiveSecretKey()).toBe(false);
  });

  it("sanitizes publishable keys the same way", () => {
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", '"pk_live_example"');
    expect(getStripePublishableKey()).toBe("pk_live_example");
  });

  it("exposes safe secret diagnostics without the key", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", '"sk_live_abcdef"');
    const diagnostics = getStripeSecretDiagnostics();
    expect(diagnostics).toEqual({
      secretConfigured: true,
      secretLength: "sk_live_abcdef".length,
      secretPrefixValid: true,
    });
    expect(JSON.stringify(diagnostics)).not.toContain("sk_live_abcdef");
  });

  it("reports empty diagnostics when secret is missing", () => {
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    expect(getStripeSecretDiagnostics()).toEqual({
      secretConfigured: false,
      secretLength: 0,
      secretPrefixValid: false,
    });
  });
});
