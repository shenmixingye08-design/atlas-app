import type { OrchestrationResult } from "@/lib/orchestration/types";
import { ui } from "@/lib/i18n";

import type {
  PrChannelId,
  PrChannelRecommendation,
  PrStrategy,
} from "./types";

const CHANNEL_LABELS: Record<PrChannelId, string> = {
  x: "X",
  blog: "ブログ",
  linkedin: "LinkedIn",
  news: "News",
  email: "Email",
};

const RANK_MARKERS = ["①", "②", "③", "④", "⑤"] as const;

export type ContentSignals = {
  isFeatureLaunch: boolean;
  isMajorUpdate: boolean;
  isInternal: boolean;
  isGuide: boolean;
  isDevDiary: boolean;
  isBehindTheScenes: boolean;
  isB2B: boolean;
  isContent: boolean;
  isNewsWorthy: boolean;
  isDriveIntegration: boolean;
  hasCompetitorResearch: boolean;
  hasHighQuality: boolean;
  isHighPriority: boolean;
  isNewsletter: boolean;
};

export function analyzeContentSignals(
  result: OrchestrationResult,
  text: string,
): ContentSignals {
  const score = result.qualityLoop?.currentScore ?? 0;
  const hasCompetitorResearch = Boolean(
    result.research?.assessment.categories.includes("competitor_research"),
  );

  return {
    isFeatureLaunch:
      /連携|統合|機能|追加|リリース|アップデート|google\s*drive|drive/i.test(
        text,
      ),
    isMajorUpdate: /大型|メジャー|major\s*update|大幅/i.test(text),
    isInternal: /社内|ハンドブック|内部資料|議事録/i.test(text),
    isGuide: /使い方|ガイド|入門|初心者|チュートリアル|how\s*to/i.test(text),
    isDevDiary: /開発日記|dev\s*log|実装|技術/i.test(text),
    isBehindTheScenes:
      /裏側|ワークフロー|ai\s*会社|社内連絡|オーケスト/i.test(text),
    isB2B: /営業|提案|b2b|企業向け|クライアント|商談/i.test(text),
    isContent: /ブログ|記事|seo|コンテンツ|コラム/i.test(text),
    isNewsWorthy:
      /ニュース|プレス|発表|launch|ローンチ/i.test(text) ||
      /連携|統合|機能|追加|リリース/i.test(text),
    isDriveIntegration: /google\s*drive|ドライブ.*連携|drive.*連携/i.test(
      text,
    ),
    hasCompetitorResearch,
    hasHighQuality: score >= 85,
    isHighPriority: score >= 90,
    isNewsletter: /ニュースレター|メール|email/i.test(text),
  };
}

function deriveWhyReasons(signals: ContentSignals): string[] {
  const reasons: string[] = [];

  if (signals.isFeatureLaunch) {
    reasons.push(ui.pr.whyNewFeature);
  }
  if (signals.isFeatureLaunch || signals.isMajorUpdate || signals.isGuide) {
    reasons.push(ui.pr.whyUserImpact);
  }
  if (signals.hasCompetitorResearch || signals.isDriveIntegration) {
    reasons.push(ui.pr.whyDifferentiation);
  }
  if (signals.hasHighQuality || signals.isBehindTheScenes) {
    reasons.push(ui.pr.whyShowcase);
  }

  if (reasons.length === 0) {
    reasons.push(ui.pr.whyShowcase);
  }

  return [...new Set(reasons)].slice(0, 3);
}

function deriveAudiences(signals: ContentSignals, text: string): string[] {
  const audiences: string[] = [];

  const push = (label: string) => {
    if (!audiences.includes(label)) audiences.push(label);
  };

  if (/初心者|はじめて|入門/i.test(text) || signals.isGuide) {
    push(ui.pr.audienceBeginners);
  }
  if (/個人開発|インディー|solo/i.test(text)) {
    push(ui.pr.audienceIndieDevelopers);
  }
  if (/企業|法人|組織|b2b/i.test(text) || signals.isB2B) {
    push(ui.pr.audienceEnterprises);
  }
  if (/マーケ|marketing|コンテンツ担当/i.test(text)) {
    push(ui.pr.audienceMarketing);
  }
  if (/営業|セールス|商談/i.test(text)) {
    push(ui.pr.audienceSales);
  }
  if (/経営|役員|cxo|decision/i.test(text)) {
    push(ui.pr.audienceExecutives);
  }
  if (/既存|リテンション|アップデート/i.test(text) || signals.isFeatureLaunch) {
    push(ui.pr.audienceExistingUsers);
  }
  if (/新規|獲得|trial|お試し/i.test(text) || signals.isFeatureLaunch) {
    push(ui.pr.audienceNewUsers);
  }
  if (/開発者|エンジニア|api|technical/i.test(text) || signals.isDevDiary) {
    push(ui.pr.audienceIndieDevelopers);
  }

  if (audiences.length === 0) {
    if (signals.isB2B) {
      push(ui.pr.audienceEnterprises);
      push(ui.pr.audienceSales);
    } else if (signals.isGuide) {
      push(ui.pr.audienceBeginners);
      push(ui.pr.audienceNewUsers);
    } else {
      push(ui.pr.audienceExistingUsers);
      push(ui.pr.audienceNewUsers);
    }
  }

  return audiences.slice(0, 3);
}

function deriveTiming(signals: ContentSignals, text: string): string {
  if (/リリース当日|本日リリース|launch\s*day/i.test(text)) {
    return ui.pr.timingReleaseDay;
  }
  if (signals.isMajorUpdate) {
    return ui.pr.timingMajorUpdate;
  }
  if (signals.isGuide || signals.isDevDiary || signals.isBehindTheScenes) {
    return ui.pr.timingSeries;
  }
  if (signals.isHighPriority || signals.isDriveIntegration) {
    return ui.pr.timingToday;
  }
  if (signals.isFeatureLaunch || signals.isNewsWorthy) {
    return ui.pr.timingThisWeek;
  }
  return ui.pr.timingThisWeek;
}

function channelScore(id: PrChannelId, signals: ContentSignals): number {
  switch (id) {
    case "blog":
      return (
        (signals.isContent || signals.isGuide ? 4 : 0) +
        (signals.isFeatureLaunch ? 3 : 0) +
        (signals.isMajorUpdate ? 2 : 0) +
        (signals.isDriveIntegration ? 2 : 0)
      );
    case "x":
      return (
        (signals.isFeatureLaunch ? 4 : 0) +
        (signals.isNewsWorthy ? 3 : 0) +
        (signals.isHighPriority ? 2 : 0) +
        1
      );
    case "linkedin":
      return (
        (signals.isB2B ? 4 : 0) +
        (signals.isFeatureLaunch ? 2 : 0) +
        (signals.isNewsWorthy ? 2 : 0) +
        (signals.hasCompetitorResearch ? 1 : 0)
      );
    case "news":
      return (
        (signals.isNewsWorthy && !signals.isInternal ? 4 : 0) +
        (signals.isMajorUpdate ? 3 : 0)
      );
    case "email":
      return (
        (signals.isB2B ? 3 : 0) +
        (signals.isInternal ? 4 : 0) +
        (signals.isNewsletter ? 2 : 0)
      );
    default:
      return 0;
  }
}

function channelRationale(id: PrChannelId, signals: ContentSignals): string {
  switch (id) {
    case "blog":
      return signals.isGuide
        ? ui.pr.channelRationaleBlogGuide
        : ui.pr.channelRationaleBlog;
    case "x":
      return ui.pr.channelRationaleX;
    case "linkedin":
      return signals.isB2B
        ? ui.pr.channelRationaleLinkedInB2b
        : ui.pr.channelRationaleLinkedIn;
    case "news":
      return ui.pr.channelRationaleNews;
    case "email":
      return signals.isB2B
        ? ui.pr.channelRationaleEmailB2b
        : ui.pr.channelRationaleEmail;
    default:
      return ui.pr.channelRationaleDefault;
  }
}

function buildChannelPriority(
  channels: readonly PrChannelRecommendation[],
  signals: ContentSignals,
): PrStrategy["channelPriority"] {
  const recommended = channels.filter((c) => c.recommended);

  const ranked = recommended
    .map((channel) => ({
      id: channel.id,
      label: channel.label,
      score: channelScore(channel.id, signals),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);

  if (ranked.length === 0) {
    return [
      {
        rank: 1,
        id: "blog",
        label: CHANNEL_LABELS.blog,
        rationale: ui.pr.channelRationaleBlog,
      },
    ];
  }

  return ranked.map((item, index) => ({
    rank: index + 1,
    id: item.id,
    label: item.label,
    rationale: channelRationale(item.id, signals),
  }));
}

function deriveChannelPrioritySummary(
  priority: PrStrategy["channelPriority"],
): string {
  if (priority.length === 0) return ui.pr.channelPrioritySummaryDefault;

  const top = priority[0]?.label ?? "ブログ";
  const second = priority[1]?.label;

  if (second) {
    return ui.pr.channelPrioritySummary(top, second);
  }
  return ui.pr.channelPrioritySummarySingle(top);
}

function deriveCampaignTitle(signals: ContentSignals): string {
  if (signals.isDriveIntegration) return ui.pr.campaignDriveIntegration;
  if (signals.isGuide) return ui.pr.campaignUsageGuide;
  if (signals.isDevDiary) return ui.pr.campaignDevDiary;
  if (signals.isBehindTheScenes) return ui.pr.campaignBehindTheScenes;
  if (signals.isFeatureLaunch || signals.isMajorUpdate) {
    return ui.pr.campaignWeeklyUpdate;
  }
  return ui.pr.campaignWeeklyUpdate;
}

function deriveExpectedEffects(signals: ContentSignals): string[] {
  const effects: string[] = [];

  const push = (label: string) => {
    if (!effects.includes(label)) effects.push(label);
  };

  if (signals.isFeatureLaunch || signals.isDriveIntegration) {
    push(ui.pr.effectFeatureAwareness);
    push(ui.pr.effectNewUserAcquisition);
  }
  if (signals.isGuide || signals.isContent) {
    push(ui.pr.effectSeoTraffic);
    push(ui.pr.effectNewUserAcquisition);
  }
  if (signals.isFeatureLaunch && !signals.isInternal) {
    push(ui.pr.effectRetention);
  }
  if (signals.isB2B) {
    push(ui.pr.effectBrandAwareness);
  }
  if (signals.isBehindTheScenes || signals.isDevDiary) {
    push(ui.pr.effectBrandAwareness);
    push(ui.pr.effectRetention);
  }

  if (effects.length === 0) {
    push(ui.pr.effectBrandAwareness);
    push(ui.pr.effectFeatureAwareness);
  }

  return effects.slice(0, 3);
}

/** Build strategic PR plan from workflow output (planning only). */
export function generatePrStrategy(
  result: OrchestrationResult,
  text: string,
  channels: readonly PrChannelRecommendation[],
  shouldShare: boolean,
): PrStrategy | null {
  if (!shouldShare) return null;

  const signals = analyzeContentSignals(result, text);
  const channelPriority = buildChannelPriority(channels, signals);

  return {
    whyReasons: deriveWhyReasons(signals),
    audiences: deriveAudiences(signals, text),
    timing: deriveTiming(signals, text),
    channelPriority,
    channelPrioritySummary: deriveChannelPrioritySummary(channelPriority),
    campaignTitle: deriveCampaignTitle(signals),
    expectedEffects: deriveExpectedEffects(signals),
  };
}

export function formatRankMarker(rank: number): string {
  return RANK_MARKERS[rank - 1] ?? `${rank}.`;
}
