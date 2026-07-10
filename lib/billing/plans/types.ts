/** ISO 8601 timestamp. */
export type Timestamp = string;

/** ATLAS membership plan identifiers. */
export type PlanId = "free" | "light" | "standard" | "premium";

/** Feature gates checked by plan policy. */
export type BillingFeatureId =
  | "content_writing"
  | "sns_assist"
  | "sns_auto_post"
  | "blog_creation"
  | "google_integration"
  | "eco_mode"
  | "advanced_automation"
  | "multi_external_integration"
  | "high_quality_mode"
  | "priority_processing"
  | "video_generation"
  | "image_generation";

export type PlanLimits = {
  /** Monthly AI run budget (orchestration / automation invocations). */
  aiUsageMonthly: number;
  /** Max connected external services at once. */
  externalIntegrations: number;
  /** Max active automation tasks. */
  automationTasks: number;
  /** Monthly SNS post executions. */
  snsPostsMonthly: number;
  highQualityMode: boolean;
  videoGeneration: boolean;
  imageGeneration: boolean;
  features: readonly BillingFeatureId[];
};

export type PlanDefinition = {
  planId: PlanId;
  name: string;
  description: string;
  monthlyPriceJpy: number;
  /** Stripe Price ID — set when Stripe products are configured. */
  stripePriceId: string | null;
  limits: PlanLimits;
  highlights: readonly string[];
};

export type PlanCatalog = {
  plans: readonly PlanDefinition[];
};

export type PlanCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; planId: PlanId };
