import { describe, expect, it, vi, afterEach, beforeEach } from "vitest";

import { buildOwnerEnvStatusSnapshot } from "./engine";

describe("owner env status", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "sk-test");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_clerk");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_clerk");
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
    vi.stubEnv("CRON_SECRET", "cron");
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.com");
    vi.stubEnv("STRIPE_SECRET_KEY", "");
    vi.stubEnv("NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("never returns secret values — only mask or unset label", () => {
    vi.stubEnv("CRON_SECRET", "super-secret-token-xyz");
    const snapshot = buildOwnerEnvStatusSnapshot();
    for (const row of snapshot.variables) {
      expect(row.displayValue === "******" || row.displayValue === "（未設定）").toBe(
        true,
      );
      expect(JSON.stringify(row)).not.toContain("sk-test");
      expect(JSON.stringify(row)).not.toContain("sk_clerk");
      expect(JSON.stringify(row)).not.toContain("super-secret-token-xyz");
    }
  });

  it("marks present keys as configured", () => {
    const snapshot = buildOwnerEnvStatusSnapshot();
    const openai = snapshot.variables.find((row) => row.key === "OPENAI_API_KEY");
    expect(openai?.configured).toBe(true);
    expect(openai?.serviceLabel).toBe("OpenAI");
  });
});
