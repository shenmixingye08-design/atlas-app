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
  /**
   * Monthly AI provider cost ceiling in USD (ledger estimatedCostUsd /
   * provider actual when available). Fail-closed before the provider call.
   */
  aiCostBudgetUsdMonthly: number;
  /** Max connected external services at once. */
  externalIntegrations: number;
  /** Max active automation tasks. */
  automationTasks: number;
  /** Monthly X auto-posts (chat / automation / scheduler / retry). */
  xAutoPostsMonthly: number;
  /**
   * Monthly X posts that include an external URL. Counted in addition to
   * {@link xAutoPostsMonthly} (URL posts also consume the total X quota).
   */
  xUrlPostsMonthly: number;
  /**
   * @deprecated Alias of {@link xAutoPostsMonthly} for existing usage meters.
   * Always equal to xAutoPostsMonthly — do not set independently.
   */
  snsPostsMonthly: number;
  /** Monthly WordPress *publish* operations (drafts do not consume). */
  wordpressPostsMonthly: number;
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
  /** Footnotes (e.g. X URL sub-quota). Not a second source of truth. */
  notes?: readonly string[];
};

export type PlanCatalog = {
  plans: readonly PlanDefinition[];
};

export type PlanCheckResult =
  | { allowed: true }
  | { allowed: false; reason: string; planId: PlanId };
