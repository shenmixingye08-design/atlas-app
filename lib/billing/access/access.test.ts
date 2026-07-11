import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => {
    if (userId.startsWith("owner_")) return "owner@atlas.test";
    if (userId.startsWith("beta_")) return "beta@atlas.test";
    return `${userId}@example.com`;
  }),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: (email: string | null | undefined) =>
    Boolean(email?.endsWith("@atlas.test") && email.startsWith("owner@")),
}));

vi.mock("@/lib/feature-flags/access", async () => {
  const actual = await vi.importActual<typeof import("@/lib/feature-flags/access")>(
    "@/lib/feature-flags/access",
  );
  return {
    ...actual,
    isAtlasBetaUserEmail: (email: string | null | undefined) =>
      Boolean(email?.startsWith("beta@")),
  };
});

describe("billing access enforcement", () => {
  beforeEach(async () => {
    vi.stubEnv("ATLAS_OWNER_EMAILS", "owner@atlas.test");
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    resetSubscriptionStore();
  });

  async function setPlan(
    userId: string,
    planId: "free" | "light" | "standard" | "premium",
    status:
      | "active"
      | "trialing"
      | "past_due"
      | "canceled"
      | "unpaid"
      | "incomplete" = "active",
  ) {
    const { applySubscriptionFromStripe } = await import(
      "@/lib/billing/subscriptions/service"
    );
    applySubscriptionFromStripe({
      userId,
      stripeCustomerId: `cus_${userId}`,
      stripeSubscriptionId: `sub_${userId}`,
      planId,
      status,
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });
  }

  it("blocks free users from google_integration", async () => {
    const { evaluateBillingFeature } = await import("@/lib/billing/access");
    await setPlan("user_free", "free");
    const { denial } = await evaluateBillingFeature(
      "user_free",
      "google_integration",
    );
    expect(denial?.status).toBe(403);
    expect(denial?.requiredPlan).toBe("standard");
    expect(denial?.reason).toContain("Standard");
  });

  it("allows light sns_assist but not sns_auto_post", async () => {
    const { evaluateBillingFeature } = await import("@/lib/billing/access");
    await setPlan("user_light", "light");
    expect(
      (await evaluateBillingFeature("user_light", "sns_assist")).denial,
    ).toBeNull();
    expect(
      (await evaluateBillingFeature("user_light", "sns_auto_post")).denial
        ?.requiredPlan,
    ).toBe("standard");
  });

  it("allows standard google and blocks premium-only high_quality", async () => {
    const { evaluateBillingFeature } = await import("@/lib/billing/access");
    await setPlan("user_std", "standard");
    expect(
      (await evaluateBillingFeature("user_std", "google_integration")).denial,
    ).toBeNull();
    expect(
      (await evaluateBillingFeature("user_std", "high_quality_mode")).denial
        ?.requiredPlan,
    ).toBe("premium");
  });

  it("allows premium image and video features", async () => {
    const { evaluateBillingFeature } = await import("@/lib/billing/access");
    await setPlan("user_prem", "premium");
    expect(
      (await evaluateBillingFeature("user_prem", "image_generation")).denial,
    ).toBeNull();
    expect(
      (await evaluateBillingFeature("user_prem", "video_generation")).denial,
    ).toBeNull();
  });

  it("treats trialing as entitled and past_due/canceled as free limits", async () => {
    const { evaluateBillingFeature, getBillingAccessSnapshot } = await import(
      "@/lib/billing/access"
    );
    await setPlan("user_trial", "standard", "trialing");
    expect(
      (await evaluateBillingFeature("user_trial", "google_integration")).denial,
    ).toBeNull();
    expect((await getBillingAccessSnapshot("user_trial")).isTrialing).toBe(true);

    await setPlan("user_past", "standard", "past_due");
    expect(
      (await evaluateBillingFeature("user_past", "google_integration")).denial,
    ).not.toBeNull();
    expect((await getBillingAccessSnapshot("user_past")).isPaymentPastDue).toBe(
      true,
    );

    await setPlan("user_cancel", "standard", "canceled");
    expect(
      (await evaluateBillingFeature("user_cancel", "google_integration"))
        .denial,
    ).not.toBeNull();
  });

  it("allows owner bypass and does not bypass beta for billing", async () => {
    const { evaluateBillingFeature, getBillingAccessSnapshot } = await import(
      "@/lib/billing/access"
    );
    await setPlan("owner_1", "free");
    expect(
      (await evaluateBillingFeature("owner_1", "google_integration")).denial,
    ).toBeNull();
    expect((await getBillingAccessSnapshot("owner_1")).isOwner).toBe(true);

    await setPlan("beta_1", "free");
    const beta = await getBillingAccessSnapshot("beta_1");
    expect(beta.isBetaUser).toBe(true);
    expect(
      (await evaluateBillingFeature("beta_1", "google_integration")).denial,
    ).not.toBeNull();
  });

  it("maps assignment intent to billing features", async () => {
    const { resolveBillingFeatureForAssignment } = await import(
      "@/lib/billing/access"
    );
    expect(
      resolveBillingFeatureForAssignment({ assignment: "ブログ記事を書いて" }),
    ).toBe("blog_creation");
    expect(
      resolveBillingFeatureForAssignment({ assignment: "SNS投稿を作成" }),
    ).toBe("sns_assist");
    expect(
      resolveBillingFeatureForAssignment({ assignment: "営業メールを書いて" }),
    ).toBe("content_writing");
  });

  it("returns structured denial JSON without secrets", async () => {
    const { evaluateBillingFeature, billingDenialToJson } = await import(
      "@/lib/billing/access"
    );
    await setPlan("user_json", "free");
    const { denial } = await evaluateBillingFeature(
      "user_json",
      "google_integration",
    );
    expect(denial).not.toBeNull();
    const json = billingDenialToJson(denial!);
    expect(json.error).toBe("plan_required");
    expect(JSON.stringify(json)).not.toMatch(/sk_|whsec_|price_/i);
  });

  it("enforces external integration limits by plan", async () => {
    const { evaluateBillingExternalIntegration } = await import(
      "@/lib/billing/access"
    );
    await setPlan("user_ext_free", "free");
    expect(
      (await evaluateBillingExternalIntegration("user_ext_free", 0)).denial,
    ).not.toBeNull();

    await setPlan("user_ext_light", "light");
    expect(
      (await evaluateBillingExternalIntegration("user_ext_light", 0)).denial,
    ).toBeNull();
    expect(
      (await evaluateBillingExternalIntegration("user_ext_light", 1)).denial,
    ).not.toBeNull();
  });
});
