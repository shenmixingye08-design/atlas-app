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

export type RevenueContent = {
  id: string;
  campaign: string;
  status: RevenueAgentStatus;
  kind: RevenueContentKind;
  platform: RevenuePlatform;
  title: string;
  hook: string;
  body: string;
  cta: string;
  recommendedPlatform: RevenuePlatform;
  assumedTarget: string;
  desiredAction: string;
  reason: string;
  video: RevenueVideoPlan | null;
  utmUrl: string;
  scheduledAt: string | null;
  publishedAt: string | null;
  postUrl: string | null;
  xTweetId: string | null;
  idempotencyKey: string;
  attemptCount: number;
  maxAttempts: number;
  lastError: string | null;
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
};

export type RevenueXConnectionView = {
  connected: boolean;
  message: string;
};

export type RevenueAgentSnapshot = {
  goals: RevenueGoals;
  items: RevenueContent[];
  costs: GenerationCostRecord[];
  insights: RevenueInsights;
  xConnection: RevenueXConnectionView;
  lastGeneratedOn: string | null;
  generatedAt: string;
};

export type GenerateMode = "daily" | "force";
