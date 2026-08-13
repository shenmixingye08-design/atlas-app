import type { BillingFeatureId, PlanDefinition, PlanId, PlanLimits } from "./types";

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

/**
 * Premium entitlements that are actually offered in Production.
 * N-01: video_generation / image_generation are intentionally absent —
 * they must never appear as paid unlocks until real engines ship.
 */
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
] as const satisfies readonly BillingFeatureId[];

function withSnsAlias(
  limits: Omit<PlanLimits, "snsPostsMonthly">,
): PlanLimits {
  return {
    ...limits,
    snsPostsMonthly: limits.xAutoPostsMonthly,
  };
}

function highlightAi(limit: number): string {
  return `AI利用 最大${limit}回/月`;
}

function highlightAutomation(limit: number): string {
  return `自動化 ${limit}件`;
}

function highlightIntegrations(limit: number): string {
  return `外部連携 ${limit}件`;
}

function highlightX(limit: number): string {
  return `X自動投稿 月${limit}件`;
}

function highlightWordPress(limit: number): string {
  return `WordPress 月${limit}件`;
}

function highlightXUrlNote(limit: number): string {
  return `X投稿のうち、URLを含む投稿は月${limit}件まで`;
}

const FREE_LIMITS = withSnsAlias({
  aiUsageMonthly: 1,
  aiCostBudgetUsdMonthly: 0.5,
  externalIntegrations: 0,
  automationTasks: 0,
  xAutoPostsMonthly: 0,
  xUrlPostsMonthly: 0,
  wordpressPostsMonthly: 0,
  highQualityMode: false,
  videoGeneration: false,
  imageGeneration: false,
  features: FREE_FEATURES,
});

const LIGHT_LIMITS = withSnsAlias({
  aiUsageMonthly: 30,
  aiCostBudgetUsdMonthly: 1.5,
  externalIntegrations: 1,
  automationTasks: 3,
  xAutoPostsMonthly: 0,
  xUrlPostsMonthly: 0,
  wordpressPostsMonthly: 0,
  highQualityMode: false,
  videoGeneration: false,
  imageGeneration: false,
  features: LIGHT_FEATURES,
});

const STANDARD_LIMITS = withSnsAlias({
  aiUsageMonthly: 100,
  aiCostBudgetUsdMonthly: 5.0,
  externalIntegrations: 3,
  automationTasks: 10,
  xAutoPostsMonthly: 30,
  xUrlPostsMonthly: 10,
  wordpressPostsMonthly: 8,
  highQualityMode: false,
  videoGeneration: false,
  imageGeneration: false,
  features: STANDARD_FEATURES,
});

const PREMIUM_LIMITS = withSnsAlias({
  aiUsageMonthly: 300,
  aiCostBudgetUsdMonthly: 15.0,
  externalIntegrations: 10,
  automationTasks: 50,
  xAutoPostsMonthly: 150,
  xUrlPostsMonthly: 30,
  wordpressPostsMonthly: 30,
  highQualityMode: true,
  videoGeneration: false,
  imageGeneration: false,
  features: PREMIUM_FEATURES,
});

export const PLAN_DEFINITIONS: readonly PlanDefinition[] = [
  {
    planId: "free",
    name: "Free",
    description: "無料体験 — 1件完成までMINERVOTを体験",
    monthlyPriceJpy: 0,
    stripePriceId: process.env.STRIPE_PRICE_FREE?.trim() || null,
    limits: FREE_LIMITS,
    highlights: [
      "無料で1件完成まで体験",
      highlightAutomation(FREE_LIMITS.automationTasks),
      "外部連携なし",
    ],
  },
  {
    planId: "light",
    name: "Light",
    description:
      "文章作成・投稿文づくりを日常的に任せたい方向け。缶コーヒー数本分の価格で、AI秘書を毎日の仕事に。",
    monthlyPriceJpy: 980,
    stripePriceId: process.env.STRIPE_PRICE_LIGHT?.trim() || null,
    limits: LIGHT_LIMITS,
    highlights: [
      highlightAi(LIGHT_LIMITS.aiUsageMonthly),
      highlightAutomation(LIGHT_LIMITS.automationTasks),
      highlightIntegrations(LIGHT_LIMITS.externalIntegrations),
      "投稿文作成",
      "Memory",
    ],
  },
  {
    planId: "standard",
    name: "Standard",
    description: "毎日の発信・繰り返し仕事をMINERVOTへ任せたい方向け",
    monthlyPriceJpy: 2980,
    stripePriceId: process.env.STRIPE_PRICE_STANDARD?.trim() || null,
    limits: STANDARD_LIMITS,
    highlights: [
      highlightAi(STANDARD_LIMITS.aiUsageMonthly),
      highlightAutomation(STANDARD_LIMITS.automationTasks),
      highlightIntegrations(STANDARD_LIMITS.externalIntegrations),
      highlightX(STANDARD_LIMITS.xAutoPostsMonthly),
      highlightWordPress(STANDARD_LIMITS.wordpressPostsMonthly),
      "Google連携",
      "Memory",
    ],
    notes: [highlightXUrlNote(STANDARD_LIMITS.xUrlPostsMonthly)],
  },
  {
    planId: "premium",
    name: "Premium",
    description: "複数の仕事をかなりMINERVOTへ任せるヘビーユーザー向け",
    monthlyPriceJpy: 9800,
    stripePriceId: process.env.STRIPE_PRICE_PREMIUM?.trim() || null,
    limits: PREMIUM_LIMITS,
    highlights: [
      highlightAi(PREMIUM_LIMITS.aiUsageMonthly),
      highlightAutomation(PREMIUM_LIMITS.automationTasks),
      highlightIntegrations(PREMIUM_LIMITS.externalIntegrations),
      highlightX(PREMIUM_LIMITS.xAutoPostsMonthly),
      highlightWordPress(PREMIUM_LIMITS.wordpressPostsMonthly),
      "高度な自動化",
      "高品質モード",
      "優先処理",
      "Memory",
    ],
    notes: [highlightXUrlNote(PREMIUM_LIMITS.xUrlPostsMonthly)],
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

/** Expected Stripe unit_amount in JPY (same as Plan Registry). */
export function getExpectedStripeAmountJpy(planId: PlanId): number {
  return getPlanDefinition(planId).monthlyPriceJpy;
}
