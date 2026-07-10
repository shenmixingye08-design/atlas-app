/** Supported PR channel identifiers (planning only — no posting yet). */
export type PrChannelId = "x" | "blog" | "linkedin" | "news" | "email";

export type PrPriority = "high" | "medium" | "low";

export type PrChannelRecommendation = {
  id: PrChannelId;
  label: string;
  recommended: boolean;
};

export type PrRankedChannel = {
  rank: number;
  id: PrChannelId;
  label: string;
  rationale: string;
};

/** Strategic marketing plan derived after CEO approval (planning only). */
export type PrStrategy = {
  whyReasons: readonly string[];
  audiences: readonly string[];
  timing: string;
  channelPriority: readonly PrRankedChannel[];
  channelPrioritySummary: string;
  campaignTitle: string;
  expectedEffects: readonly string[];
};

type MetricStub = { enabled: false; note: string };

/**
 * PR review produced after CEO approval.
 * Planning stage only — extension hooks reserved for future automation.
 */
export type PrReview = {
  shouldShare: boolean;
  summary: string;
  headline: string;
  targetAudience: string;
  reason: string;
  priority: PrPriority;
  channels: readonly PrChannelRecommendation[];
  strategy: PrStrategy | null;
  /** Reserved for future SNS posting, analytics, scheduling, and media generation. */
  extensions: PrReviewExtensions;
};

/** Future-ready capability flags — not implemented yet. */
export type PrReviewExtensions = {
  snsPosting: { enabled: false; note: string };
  analytics: { enabled: false; note: string };
  scheduling: { enabled: false; note: string };
  imageGeneration: { enabled: false; note: string };
  videoGeneration: { enabled: false; note: string };
  performanceMetrics: {
    enabled: false;
    ctr: MetricStub;
    impressions: MetricStub;
    clicks: MetricStub;
    conversions: MetricStub;
    learning: MetricStub;
  };
};

export const PR_EXTENSION_STUBS: PrReviewExtensions = {
  snsPosting: { enabled: false, note: "SNS投稿（将来対応）" },
  analytics: { enabled: false, note: "効果測定（将来対応）" },
  scheduling: { enabled: false, note: "予約投稿（将来対応）" },
  imageGeneration: { enabled: false, note: "画像生成（将来対応）" },
  videoGeneration: { enabled: false, note: "動画生成（将来対応）" },
  performanceMetrics: {
    enabled: false,
    ctr: { enabled: false, note: "CTR（将来対応）" },
    impressions: { enabled: false, note: "インプレッション（将来対応）" },
    clicks: { enabled: false, note: "クリック（将来対応）" },
    conversions: { enabled: false, note: "コンバージョン（将来対応）" },
    learning: { enabled: false, note: "学習・最適化（将来対応）" },
  },
};
