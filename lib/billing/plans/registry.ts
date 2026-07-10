import type { BillingFeatureId, PlanDefinition, PlanId } from "./types";

const FREE_FEATURES = [
  "content_writing",
] as const satisfies readonly BillingFeatureId[];

const LIGHT_FEATURES = [
  "content_writing",
  "sns_assist",
] as const satisfies readonly BillingFeatureId[];

const STANDARD_FEATURES = [
  "content_writing",
  "sns_assist",
  "sns_auto_post",
  "blog_creation",
  "google_integration",
  "eco_mode",
] as const satisfies readonly BillingFeatureId[];

const PREMIUM_FEATURES = [
  "content_writing",
  "sns_assist",
  "sns_auto_post",
  "blog_creation",
  "google_integration",
  "eco_mode",
  "advanced_automation",
  "multi_external_integration",
  "high_quality_mode",
  "priority_processing",
  "video_generation",
  "image_generation",
] as const satisfies readonly BillingFeatureId[];

export const PLAN_DEFINITIONS: readonly PlanDefinition[] = [
  {
    planId: "free",
    name: "Free",
    description: "無料体験 — 低回数利用、外部連携は制限",
    monthlyPriceJpy: 0,
    stripePriceId: process.env.STRIPE_PRICE_FREE?.trim() || null,
    limits: {
      aiUsageMonthly: 20,
      externalIntegrations: 0,
      automationTasks: 1,
      snsPostsMonthly: 0,
      highQualityMode: false,
      videoGeneration: false,
      imageGeneration: false,
      features: FREE_FEATURES,
    },
    highlights: ["文章作成（低回数）", "自動化タスク 1件", "外部連携なし"],
  },
  {
    planId: "light",
    name: "Light",
    description: "文章作成とSNS投稿補助、基本的な自動化",
    monthlyPriceJpy: 980,
    stripePriceId: process.env.STRIPE_PRICE_LIGHT?.trim() || null,
    limits: {
      aiUsageMonthly: 120,
      externalIntegrations: 1,
      automationTasks: 3,
      snsPostsMonthly: 30,
      highQualityMode: false,
      videoGeneration: false,
      imageGeneration: false,
      features: LIGHT_FEATURES,
    },
    highlights: ["文章作成", "SNS投稿補助", "自動化タスク 3件"],
  },
  {
    planId: "standard",
    name: "Standard",
    description: "SNS自動投稿・ブログ・Google連携・エコモード",
    monthlyPriceJpy: 2980,
    stripePriceId: process.env.STRIPE_PRICE_STANDARD?.trim() || null,
    limits: {
      aiUsageMonthly: 400,
      externalIntegrations: 3,
      automationTasks: 10,
      snsPostsMonthly: 120,
      highQualityMode: false,
      videoGeneration: false,
      imageGeneration: false,
      features: STANDARD_FEATURES,
    },
    highlights: [
      "SNS自動投稿",
      "ブログ作成",
      "Google連携",
      "エコモード",
    ],
  },
  {
    planId: "premium",
    name: "Premium",
    description: "高度な自動化・複数連携・高品質モード・優先処理",
    monthlyPriceJpy: 9800,
    stripePriceId: process.env.STRIPE_PRICE_PREMIUM?.trim() || null,
    limits: {
      aiUsageMonthly: 2000,
      externalIntegrations: 10,
      automationTasks: 50,
      snsPostsMonthly: 500,
      highQualityMode: true,
      videoGeneration: true,
      imageGeneration: true,
      features: PREMIUM_FEATURES,
    },
    highlights: [
      "高度な自動化",
      "複数外部サービス連携",
      "高品質モード",
      "優先処理",
    ],
  },
] as const;

const planById: Record<PlanId, PlanDefinition> = Object.fromEntries(
  PLAN_DEFINITIONS.map((plan) => [plan.planId, plan]),
) as Record<PlanId, PlanDefinition>;

export function getPlanDefinition(planId: PlanId): PlanDefinition {
  return planById[planId];
}

export function listPlanDefinitions(): readonly PlanDefinition[] {
  return PLAN_DEFINITIONS;
}

export function isPlanId(value: string): value is PlanId {
  return value in planById;
}

export function getPaidPlans(): readonly PlanDefinition[] {
  return PLAN_DEFINITIONS.filter((plan) => plan.monthlyPriceJpy > 0);
}
