import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  getStripePriceIdDiagnostics,
  getStripePriceIdForPlan,
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

  it("does not truncate long sk_live_ keys", () => {
    const longKey = `sk_live_${"a".repeat(100)}`;
    expect(sanitizeStripeEnvValue(longKey)).toBe(longKey);
    expect(sanitizeStripeEnvValue(`"${longKey}"`)).toBe(longKey);
    expect(sanitizeStripeEnvValue(longKey)?.length).toBe(108);
  });

  it("does not strip when only one side has a quote", () => {
    expect(sanitizeStripeEnvValue('"sk_live_abc')).toBe('"sk_live_abc');
    expect(sanitizeStripeEnvValue("sk_live_abc\"")).toBe("sk_live_abc\"");
  });

  it("does not strip when the interior contains the same quote", () => {
    const weird = `"sk_live_xx"yy"`;
    expect(sanitizeStripeEnvValue(weird)).toBe(weird);
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

describe("getStripePriceIdForPlan sanitization", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("strips surrounding quotes from Price IDs", () => {
    vi.stubEnv("STRIPE_PRICE_LIGHT", '"price_1TsI2E3erKCSPXWZODFWWQ8z"');
    expect(getStripePriceIdForPlan("light")).toBe(
      "price_1TsI2E3erKCSPXWZODFWWQ8z",
    );
  });

  it("strips BOM and whitespace from Price IDs", () => {
    vi.stubEnv(
      "STRIPE_PRICE_STANDARD",
      "\uFEFF  price_1StandardExampleJPYMonth  \r\n",
    );
    expect(getStripePriceIdForPlan("standard")).toBe(
      "price_1StandardExampleJPYMonth",
    );
  });

  it("exposes safe price diagnostics without the raw id", () => {
    vi.stubEnv("STRIPE_PRICE_PREMIUM", "'price_1PremiumExample'");
    const diagnostics = getStripePriceIdDiagnostics("premium");
    expect(diagnostics).toEqual({
      configured: true,
      length: "price_1PremiumExample".length,
      prefixValid: true,
    });
    expect(JSON.stringify(diagnostics)).not.toContain("price_1PremiumExample");
  });

  it("reports prefixValid false when id does not start with price_", () => {
    vi.stubEnv("STRIPE_PRICE_LIGHT", '"prod_notAPriceId"');
    expect(getStripePriceIdDiagnostics("light")).toEqual({
      configured: true,
      length: "prod_notAPriceId".length,
      prefixValid: false,
    });
  });
});
