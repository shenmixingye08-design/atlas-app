import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async (userId: string) => `${userId}@example.com`),
}));

vi.mock("@/lib/auth/is-atlas-owner", () => ({
  isAtlasOwnerEmail: () => false,
}));

import { QUICK_REQUEST_PRESETS } from "@/lib/workspace/quick-request-presets";
import { LANDING_REQUEST_EXAMPLES } from "@/lib/landing/content";
import { WORKFLOW_TEMPLATES } from "@/lib/automations/workflow-templates";
import { connectorProviders } from "@/lib/connectors/definitions";
import { CAPABILITY_REGISTRY } from "@/lib/automation-platform/step-registry/registry";
import {
  resetFeatureFlagStore,
  getFeatureFlagState,
  setFeatureFlagState,
} from "@/lib/feature-flags/store";
import {
  resolveOrchestrationFeatureFlag,
  isOrchestrationFeatureEnabled,
} from "@/lib/feature-flags/guards";
import {
  buildFeatureAccessContext,
  isFeatureEnabled,
} from "@/lib/feature-flags/access";
import { TERMS_ARTICLES } from "@/lib/legal/terms-content";
import { PRIVACY_ARTICLES } from "@/lib/legal/privacy-content";

import {
  assertPlanCatalogMediaGenerationHonesty,
  FORBIDDEN_MEDIA_GENERATION_CLAIM_PATTERNS,
  isBillingFeatureOfferedOnAnyPlan,
  PRODUCTION_UNOFFERED_BILLING_FEATURES,
  resolveMinimumOfferedPlanForFeature,
} from "./offered-capabilities";
import { getPlanDefinition, listPlanDefinitions } from "./registry";

describe("N-01 premium capability honesty", () => {
  beforeEach(async () => {
    resetFeatureFlagStore();
    const { resetSubscriptionStore } = await import(
      "@/lib/billing/subscriptions/store"
    );
    resetSubscriptionStore();
  });

  it("does not offer video/image generation on any plan including premium", () => {
    const honesty = assertPlanCatalogMediaGenerationHonesty();
    expect(honesty).toEqual({ ok: true });

    for (const feature of PRODUCTION_UNOFFERED_BILLING_FEATURES) {
      expect(isBillingFeatureOfferedOnAnyPlan(feature)).toBe(false);
      expect(resolveMinimumOfferedPlanForFeature(feature)).toBeNull();
    }

    const premium = getPlanDefinition("premium");
    expect(premium.limits.videoGeneration).toBe(false);
    expect(premium.limits.imageGeneration).toBe(false);
    expect(premium.limits.features).not.toContain("video_generation");
    expect(premium.limits.features).not.toContain("image_generation");

    // Offered premium capabilities remain.
    expect(premium.limits.features).toContain("high_quality_mode");
    expect(premium.limits.features).toContain("advanced_automation");
    expect(premium.limits.highQualityMode).toBe(true);
  });

  it("keeps plan highlights free of media-generation claims", () => {
    for (const plan of listPlanDefinitions()) {
      const blob = [plan.description, ...plan.highlights].join("\n");
      for (const pattern of FORBIDDEN_MEDIA_GENERATION_CLAIM_PATTERNS) {
        expect(blob.toLowerCase()).not.toContain(pattern.toLowerCase());
      }
    }
  });

  it("hides image-generation quick preset and landing video card", () => {
    const labels = QUICK_REQUEST_PRESETS.map((p) => p.label);
    expect(labels).not.toContain("画像生成");
    expect(labels).not.toContain("動画生成");
    expect(
      LANDING_REQUEST_EXAMPLES.map((ex) => ex.id as string),
    ).not.toContain("video");
  });

  it("does not label SNS workflow step as 画像生成", () => {
    const step = WORKFLOW_TEMPLATES.sns_post.steps.find(
      (s) => s.id === "image_generation",
    );
    expect(step).toBeTruthy();
    expect(step?.label).not.toContain("画像生成");
  });

  it("marks OpenAI images connector as coming_soon", () => {
    const openai = connectorProviders.find((p) => p.id === "openai");
    const images = openai?.services.find((s) => s.id === "images");
    expect(images?.status).toBe("coming_soon");
    expect(openai?.description.toLowerCase()).not.toContain("画像生成");
  });

  it("does not gate vision analysis on image_generation flag", () => {
    const vision = CAPABILITY_REGISTRY.find((c) => c.id === "vision_analysis");
    expect(vision?.requiredFeatureFlag).toBeNull();
  });

  it("defaults media-generation feature flags to off", () => {
    expect(getFeatureFlagState("video_generation")).toBe("off");
    expect(getFeatureFlagState("image_generation")).toBe("off");
  });

  it("blocks explicit media-generation orchestration, not ordinary copy", () => {
    const ctx = buildFeatureAccessContext("user@example.com");
    expect(
      resolveOrchestrationFeatureFlag({ assignment: "画像生成してロゴを作って" }),
    ).toBe("image_generation");
    expect(
      isOrchestrationFeatureEnabled(
        { assignment: "画像生成してロゴを作って" },
        ctx,
      ),
    ).toBe(false);

    expect(
      resolveOrchestrationFeatureFlag({
        assignment: "動画のタイトルと説明文を作って",
      }),
    ).toBe("ai_employees");
    expect(
      isOrchestrationFeatureEnabled(
        { assignment: "動画のタイトルと説明文を作って" },
        ctx,
      ),
    ).toBe(true);
  });

  it("removes media-generation claims from terms/privacy user-facing lists", () => {
    const termsBlob = JSON.stringify(TERMS_ARTICLES);
    const privacyBlob = JSON.stringify(PRIVACY_ARTICLES);
    for (const pattern of ["画像生成", "動画生成"] as const) {
      expect(termsBlob).not.toContain(pattern);
      expect(privacyBlob).not.toContain(pattern);
    }
  });

  it("hard-closes media flags for non-owners even if toggled on", () => {
    setFeatureFlagState("image_generation", "on");
    setFeatureFlagState("video_generation", "on");
    const user = buildFeatureAccessContext("user@example.com");
    expect(isFeatureEnabled("image_generation", user)).toBe(false);
    expect(isFeatureEnabled("video_generation", user)).toBe(false);
  });

  it("denies premium billing entitlement for unoffered media features", async () => {
    const { applySubscriptionFromStripe } = await import(
      "@/lib/billing/subscriptions/service"
    );
    await applySubscriptionFromStripe({
      userId: "user_n01_prem",
      stripeCustomerId: "cus_n01",
      stripeSubscriptionId: "sub_n01",
      planId: "premium",
      status: "active",
      currentPeriodStart: new Date().toISOString(),
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    });

    const { evaluateBillingFeature } = await import("@/lib/billing/access");
    const image = await evaluateBillingFeature(
      "user_n01_prem",
      "image_generation",
    );
    const video = await evaluateBillingFeature(
      "user_n01_prem",
      "video_generation",
    );
    expect(image.denial?.requiredPlan).toBeNull();
    expect(video.denial?.requiredPlan).toBeNull();
    expect(image.denial?.reason).toContain("現在ご利用いただけません");
  });
});
