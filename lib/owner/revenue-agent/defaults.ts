import type { RevenueGoals, RevenueMetrics } from "./types";

export const REVENUE_AGENT_CAMPAIGN = "minervot_solo_acquisition_beta";

export const DEFAULT_BANNED_PHRASES = [
  "確実に稼げる",
  "必ず儲かる",
  "誰でも月収",
  "導入社数",
  "売上実績",
  "平均○○万円",
  "効果が実証",
] as const;

export function emptyMetrics(): RevenueMetrics {
  return {
    impressions: null,
    likes: null,
    replies: null,
    reposts: null,
    linkClicks: null,
    lpVisits: null,
    signups: null,
    paidConversions: null,
    revenueYen: null,
  };
}

export function unknownMetricSources(): Record<
  keyof RevenueMetrics,
  "unknown"
> {
  return {
    impressions: "unknown",
    likes: "unknown",
    replies: "unknown",
    reposts: "unknown",
    linkClicks: "unknown",
    lpVisits: "unknown",
    signups: "unknown",
    paidConversions: "unknown",
    revenueYen: "unknown",
  };
}

export function defaultRevenueGoals(now = new Date()): RevenueGoals {
  const start = new Date(now);
  start.setUTCDate(1);
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  return {
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    lpUrl: "https://minervot.com/",
    targetAudience: "定型業務に時間を取られる副業者・個人事業主",
    dailyPostTarget: 1,
    platforms: ["x"],
    requireApproval: true,
    bannedPhrases: [...DEFAULT_BANNED_PHRASES],
    brandTone:
      "丁寧で落ち着いた一流秘書。誇張せず、時間を生み出す話に限定する。",
    cta: "MINERVOTのLPまたは無料登録",
    monthlySignupGoal: null,
    monthlyRevenueGoalYen: null,
  };
}

export const MAX_PUBLISH_ATTEMPTS = 3;
