import type { PrChannelId } from "@/lib/pr/types";

export type ImpactLevel = "high" | "medium" | "low";

export type GrowthImpactAssessment = {
  reach: ImpactLevel;
  engagement: ImpactLevel;
  seoValue: ImpactLevel;
  userAcquisition: ImpactLevel;
  brandAwareness: ImpactLevel;
  confidence: ImpactLevel;
};

export type ChannelEffectEstimate = {
  id: PrChannelId;
  label: string;
  metric: string;
  level: ImpactLevel;
};

type SourceStub = { enabled: false; note: string };

/** Growth review evaluating a PR strategy (analysis only — no live data). */
export type GrowthReview = {
  summary: string;
  impacts: GrowthImpactAssessment;
  channelEffects: readonly ChannelEffectEstimate[];
  strengths: readonly string[];
  weaknesses: readonly string[];
  improvements: readonly string[];
  nextTests: readonly string[];
  recommendation: string;
  /** Reserved for future analytics integrations — not implemented yet. */
  extensions: GrowthReviewExtensions;
};

export type GrowthReviewExtensions = {
  googleAnalytics: SourceStub;
  searchConsole: SourceStub;
  xAnalytics: SourceStub;
  linkedInAnalytics: SourceStub;
  emailAnalytics: SourceStub;
};

export const GROWTH_EXTENSION_STUBS: GrowthReviewExtensions = {
  googleAnalytics: { enabled: false, note: "Google Analytics（将来対応）" },
  searchConsole: { enabled: false, note: "Search Console（将来対応）" },
  xAnalytics: { enabled: false, note: "X Analytics（将来対応）" },
  linkedInAnalytics: { enabled: false, note: "LinkedIn Analytics（将来対応）" },
  emailAnalytics: { enabled: false, note: "Email Analytics（将来対応）" },
};
