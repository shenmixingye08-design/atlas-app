export const REVENUE_AGENT_STATUSES = [
  "draft",
  "pending_approval",
  "approved",
  "scheduled",
  "published",
  "rejected",
  "failed",
] as const;

export type RevenueAgentStatus = (typeof REVENUE_AGENT_STATUSES)[number];

export const REVENUE_PLATFORMS = ["x", "tiktok", "youtube_shorts"] as const;
export type RevenuePlatform = (typeof REVENUE_PLATFORMS)[number];

export const REVENUE_CONTENT_KINDS = [
  "pain_point",
  "practical_knowhow",
  "minervot_use_case",
  "developer_experience",
  "comparison_before_after",
  "short_video",
] as const;
export type RevenueContentKind = (typeof REVENUE_CONTENT_KINDS)[number];

/** null = 未取得。0 は実測のゼロ。混同しない。 */
export type MeasuredNumber = number | null;

export type RevenueGoals = {
  periodStart: string;
  periodEnd: string;
  lpUrl: string;
  targetAudience: string;
  dailyPostTarget: number;
  platforms: RevenuePlatform[];
  requireApproval: boolean;
  bannedPhrases: string[];
  brandTone: string;
  cta: string;
  monthlySignupGoal: number | null;
  monthlyRevenueGoalYen: number | null;
};

export type RevenueVideoPlan = {
  concept: string;
  script: string;
  durationSec: number;
  telops: string[];
  cuts: Array<{ atSec: number; direction: string }>;
  caption: string;
  hashtags: string[];
  thumbnailCopy: string;
};

export type RevenueMetrics = {
  impressions: MeasuredNumber;
  likes: MeasuredNumber;
  replies: MeasuredNumber;
  reposts: MeasuredNumber;
  linkClicks: MeasuredNumber;
  lpVisits: MeasuredNumber;
  signups: MeasuredNumber;
  paidConversions: MeasuredNumber;
  revenueYen: MeasuredNumber;
};

export type RevenueMetricKey = keyof RevenueMetrics;

export type RevenueMetricSource = "auto" | "manual" | "unknown";

export type RevenueClaimCheck = {
  ok: boolean;
  hits: string[];
};

export type RevenueLearningVerdict = "continue" | "improve" | "stop" | "hold";

export type RevenueContent = {
  id: string;
  campaign: string;
  campaignId: string;
  contentId: string;
  status: RevenueAgentStatus;
  kind: RevenueContentKind;
  platform: RevenuePlatform;
  title: string;
  hook: string;
  body: string;
  cta: string;
  recommendedPlatform: RevenuePlatform;
  assumedTarget: string;
  painPoint: string;
  intent: string;
  featureExample: string;
  signupPath: string;
  desiredAction: string;
  reason: string;
  claimCheck: RevenueClaimCheck;
  video: RevenueVideoPlan | null;
  utmUrl: string;
  trackingUrl: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  postUrl: string | null;
  xTweetId: string | null;
  idempotencyKey: string;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
  failedStage: string | null;
  retryable: boolean;
  metrics: RevenueMetrics;
  metricSource: Record<RevenueMetricKey, RevenueMetricSource>;
  generationMode: "ai" | "template";
  createdAt: string;
  updatedAt: string;
  generationId: string;
};

export type GenerationCostRecord = {
  id: string;
  at: string;
  generationId: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  estimatedCostUsd: number;
  ecoMode: boolean;
  batchSize: number;
  cached: boolean;
};

export type InsightConfidence = "insufficient" | "provisional" | "directional";

export type RankedPostInsight = {
  id: string;
  title: string;
  hook: string;
  score: number | null;
  note: string;
};

export type RevenueLearningRecommendation = {
  contentId: string;
  title: string;
  verdict: RevenueLearningVerdict;
  reason: string;
  measured: {
    revenueYen: MeasuredNumber;
    paidContracts: MeasuredNumber;
    firstSuccesses: MeasuredNumber;
    signups: MeasuredNumber;
    uniqueClicks: MeasuredNumber;
    engagement: MeasuredNumber;
  };
  dataGap: string | null;
  nextCtaOrAxis: string;
};

export type RevenueInsights = {
  confidence: InsightConfidence;
  sampleSize: number;
  topPosts: RankedPostInsight[];
  bottomPosts: RankedPostInsight[];
  strongHooks: string[];
  strongThemes: string[];
  strongCtas: string[];
  lpVisitRate: number | null;
  signupRate: number | null;
  paidConversionRate: number | null;
  revenuePerPostYen: number | null;
  disclaimer: string;
  recommendations: RevenueLearningRecommendation[];
};

export type RevenueXConnectionView = {
  connected: boolean;
  message: string;
};

export type RevenueFunnelRange = "7d" | "30d" | "all";

export type RevenueFunnelTotals = {
  publishedPosts: MeasuredNumber;
  clicks: MeasuredNumber;
  uniqueVisits: MeasuredNumber;
  signups: MeasuredNumber;
  firstJobs: MeasuredNumber;
  firstAutomations: MeasuredNumber;
  checkoutStarted: MeasuredNumber;
  paidContracts: MeasuredNumber;
  cashRevenueYen: MeasuredNumber;
  refundsYen: MeasuredNumber;
  ctr: MeasuredNumber;
  clickToSignupRate: MeasuredNumber;
  signupToFirstSuccessRate: MeasuredNumber;
  signupToPaidRate: MeasuredNumber;
  signupsPerPost: MeasuredNumber;
  cashPerPostYen: MeasuredNumber;
  openaiCostUsd: MeasuredNumber;
  adSpendYen: MeasuredNumber;
  paidAcquisitionCostYen: MeasuredNumber;
  roas: MeasuredNumber;
};

export type RevenueContentRow = {
  contentId: string;
  publishedAt: string | null;
  title: string;
  cta: string;
  status: RevenueAgentStatus;
  postUrl: string | null;
  clicks: MeasuredNumber;
  signups: MeasuredNumber;
  firstSuccesses: MeasuredNumber;
  paidContracts: MeasuredNumber;
  cashRevenueYen: MeasuredNumber;
  aiCostUsd: MeasuredNumber;
  verdict: RevenueLearningVerdict;
  verdictLabel: string;
};

export type RevenueAgentSnapshot = {
  goals: RevenueGoals;
  items: RevenueContent[];
  costs: GenerationCostRecord[];
  insights: RevenueInsights;
  xConnection: RevenueXConnectionView;
  lastGeneratedOn: string | null;
  generatedAt: string;
  range: RevenueFunnelRange;
  funnel: RevenueFunnelTotals;
  contentRows: RevenueContentRow[];
  adSpendYen: MeasuredNumber;
};

export type GenerateMode = "daily" | "force";
