/**
 * P3-02 Company template tenant isolation — unit contracts.
 * Live Postgres SoT is proven by Production `/api/health/company-template`.
 */

import { afterEach, describe, expect, it, vi } from "vitest";

import {
  resolveAuthoritativeTemplateId,
  resetActiveCompanyDurableForTests,
  ACTIVE_COMPANY_DOMAIN_KEY,
} from "./durable";
import {
  clearServerActiveCompanyStateForUser,
  getServerActiveCompanyStateForUser,
  hasServerActiveCompanyStateForUser,
  setServerActiveCompanyStateForUser,
} from "./store";

describe("P3-02 Company template tenant isolation", () => {
  afterEach(() => {
    resetActiveCompanyDurableForTests();
    clearServerActiveCompanyStateForUser("user_a");
    clearServerActiveCompanyStateForUser("user_b");
    vi.restoreAllMocks();
  });

  it("happy path: per-user cache holds distinct templates", () => {
    setServerActiveCompanyStateForUser("user_a", {
      templateId: "blogging",
      selectedAt: "2026-01-01T00:00:00.000Z",
    });
    setServerActiveCompanyStateForUser("user_b", {
      templateId: "youtube",
      selectedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(getServerActiveCompanyStateForUser("user_a").templateId).toBe(
      "blogging",
    );
    expect(getServerActiveCompanyStateForUser("user_b").templateId).toBe(
      "youtube",
    );
  });

  it("memory miss does not seed Map (hydrate can load SoT)", () => {
    clearServerActiveCompanyStateForUser("user_a");
    const state = getServerActiveCompanyStateForUser("user_a");
    expect(state.templateId).toBe("marketing-agency");
    expect(hasServerActiveCompanyStateForUser("user_a")).toBe(false);
  });

  it("server authority rejects metadata spoof of another template", () => {
    setServerActiveCompanyStateForUser("user_a", {
      templateId: "blogging",
      selectedAt: "2026-01-01T00:00:00.000Z",
    });
    expect(
      resolveAuthoritativeTemplateId({
        userId: "user_a",
        metadataTemplateId: "youtube",
      }),
    ).toBe("blogging");
    expect(
      resolveAuthoritativeTemplateId({
        userId: "user_a",
        metadataTemplateId: "blogging",
      }),
    ).toBe("blogging");
    expect(
      resolveAuthoritativeTemplateId({
        userId: "user_a",
        metadataTemplateId: "not-a-real-template",
      }),
    ).toBe("blogging");
  });

  it("fail-closed: apply without userId throws", async () => {
    const { applyCompanyTemplateForUser } = await import(
      "./apply-template.server"
    );
    await expect(applyCompanyTemplateForUser("", "blogging")).rejects.toThrow(
      /userId/i,
    );
  });

  it("domain key is supabase-only SoT (not memory Map name)", async () => {
    expect(ACTIVE_COMPANY_DOMAIN_KEY).toBe("atlasActiveCompany");
    const { SUPABASE_ONLY_DOMAIN_KEYS } = await import(
      "@/lib/persistence/durable-domain"
    );
    expect(SUPABASE_ONLY_DOMAIN_KEYS).toContain("atlasActiveCompany");
  });

  it("account wipe includes atlasActiveCompany", async () => {
    const { ACCOUNT_WIPE_DOMAIN_KEYS } = await import(
      "@/lib/account-deletion/durable"
    );
    expect(ACCOUNT_WIPE_DOMAIN_KEYS).toContain("atlasActiveCompany");
  });
});
