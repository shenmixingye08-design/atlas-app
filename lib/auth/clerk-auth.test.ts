import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  assertClerkSafeForProduction,
  isClerkConfigured,
  isClerkWebhookConfigured,
  usesClerkDevelopmentKeys,
} from "./clerk-production-guard";
import {
  assertOwnerEmailsConfiguredForProduction,
  isAtlasOwnerEmail,
  parseAtlasOwnerEmails,
} from "./is-atlas-owner";
import {
  ATLAS_APP_HOME_PATH,
  ATLAS_PROTECTED_PAGE_MATCHERS,
  ATLAS_PUBLIC_API_MATCHERS,
} from "./public-routes";

describe("Clerk production guard", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("detects development keys", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    expect(usesClerkDevelopmentKeys()).toBe(true);
    expect(isClerkConfigured()).toBe(true);
  });

  it("accepts live keys", () => {
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_abc");
    expect(usesClerkDevelopmentKeys()).toBe(false);
  });

  it("blocks development keys in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_test_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_test_abc");
    expect(() => assertClerkSafeForProduction()).toThrow(/Development keys/);
  });

  it("blocks missing keys in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "");
    vi.stubEnv("CLERK_SECRET_KEY", "");
    expect(() => assertClerkSafeForProduction()).toThrow(/must be set/);
  });

  it("allows live keys in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY", "pk_live_abc");
    vi.stubEnv("CLERK_SECRET_KEY", "sk_live_abc");
    expect(() => assertClerkSafeForProduction()).not.toThrow();
  });

  it("reports webhook secret presence", () => {
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "");
    expect(isClerkWebhookConfigured()).toBe(false);
    vi.stubEnv("CLERK_WEBHOOK_SECRET", "whsec_test");
    expect(isClerkWebhookConfigured()).toBe(true);
  });
});

describe("Owner email gate", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test, admin@atlas.test");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("parses owner emails", () => {
    expect(parseAtlasOwnerEmails()).toEqual([
      "owner@atlas.test",
      "admin@atlas.test",
    ]);
  });

  it("allows owner emails case-insensitively", () => {
    expect(isAtlasOwnerEmail("Owner@Atlas.test")).toBe(true);
  });

  it("denies general users", () => {
    expect(isAtlasOwnerEmail("user@example.com")).toBe(false);
  });

  it("denies null / empty primary email safely", () => {
    expect(isAtlasOwnerEmail(null)).toBe(false);
    expect(isAtlasOwnerEmail(undefined)).toBe(false);
    expect(isAtlasOwnerEmail("")).toBe(false);
  });

  it("denies everyone when owner list is empty", () => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "");
    expect(isAtlasOwnerEmail("owner@atlas.test")).toBe(false);
  });

  it("requires owner emails in production", () => {
    vi.stubEnv("VERCEL_ENV", "production");
    vi.stubEnv("ATLAS_OWNER_EMAILS", "");
    expect(() => assertOwnerEmailsConfiguredForProduction()).toThrow(
      /ATLAS_OWNER_EMAILS/,
    );
  });
});

describe("auth route matchers", () => {
  it("keeps sign-in/up public via page list and clerk webhook public", () => {
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain("/api/webhooks/clerk(.*)");
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain("/api/health/version(.*)");
    // Health probes stay middleware-public for CRON Bearer, but handlers gate auth.
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/word-pipeline(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/word-request-trace(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/reliability-events(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/billing-schema(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/oauth-encryption(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain("/api/health/authz(.*)");
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/secrets-leakage(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain("/api/health/upload-ssrf(.*)");
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain("/api/health/reliability(.*)");
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/automation-v2-db(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/side-effect-idempotency(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/notification-retry(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/external-monitor(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/pdf-tables(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/deliverable-quality(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/work-queue(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/api-contracts(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/content-quality-gate(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain(
      "/api/health/worker-scale(.*)",
    );
    expect(ATLAS_PUBLIC_API_MATCHERS).toContain("/api/health/vision(.*)");
    expect(ATLAS_PROTECTED_PAGE_MATCHERS).toContain("/owner(.*)");
    expect(ATLAS_PROTECTED_PAGE_MATCHERS).toContain("/projects(.*)");
    expect(ATLAS_APP_HOME_PATH).toBe("/projects");
  });
});
