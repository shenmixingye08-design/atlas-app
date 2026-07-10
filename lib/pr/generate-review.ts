import type { OrchestrationResult } from "@/lib/orchestration/types";
import { getDeliverablePreviewText } from "@/lib/orchestration/deliverable-types";
import { ui } from "@/lib/i18n";

import { generatePrStrategy } from "./generate-strategy";
import {
  PR_EXTENSION_STUBS,
  type PrChannelId,
  type PrChannelRecommendation,
  type PrPriority,
  type PrReview,
} from "./types";

const CHANNEL_ORDER: readonly PrChannelId[] = [
  "x",
  "blog",
  "linkedin",
  "news",
  "email",
];

const CHANNEL_LABELS: Record<PrChannelId, string> = {
  x: "X",
  blog: "ブログ",
  linkedin: "LinkedIn",
  news: "News",
  email: "Email",
};

function corpus(result: OrchestrationResult): string {
  return [
    result.assignment,
    result.finalResponse,
    getDeliverablePreviewText(result.deliverable),
    result.research?.report?.executiveSummary ?? "",
  ]
    .join("\n")
    .toLowerCase();
}

/** True when CEO has approved the final deliverable. */
export function isCeoApprovedForPr(result: OrchestrationResult): boolean {
  if (result.status !== "completed") return false;
  if (result.qualityLoop?.ceoApproval?.approved === true) return true;
  return result.approved === true && Boolean(getDeliverablePreviewText(result.deliverable));
}

function deriveHeadline(result: OrchestrationResult): string {
  const assignment = result.assignment.trim();
  const firstLine = assignment.split("\n")[0]?.trim() ?? "";

  if (/google\s*drive|ドライブ.*連携|drive.*連携/i.test(corpus(result))) {
    return ui.pr.headlineDriveIntegration;
  }

  if (/リリース|新機能|アップデート|追加しました/i.test(corpus(result))) {
    const match = firstLine.match(/(.{1,36})/);
    if (match && firstLine.length <= 40) {
      return firstLine.replace(/[。．.!！?？]+$/, "");
    }
  }

  if (firstLine.length > 0 && firstLine.length <= 42) {
    return firstLine.replace(/[。．.!！?？]+$/, "");
  }

  return ui.pr.headlineDefault;
}

function deriveTargetAudience(text: string): string {
  if (/atlas\s*ユーザー|atlasユーザー|既存ユーザー|ユーザー向け/i.test(text)) {
    return ui.pr.audienceAtlasUsers;
  }
  if (/営業|b2b|企業|クライアント|商談/i.test(text)) {
    return ui.pr.audienceBusiness;
  }
  if (/開発者|エンジニア|technical|api/i.test(text)) {
    return ui.pr.audienceDevelopers;
  }
  return ui.pr.audienceAtlasUsers;
}

function deriveReason(result: OrchestrationResult, text: string): string {
  if (/連携|統合|google\s*drive|drive|新機能|リリース/i.test(text)) {
    return ui.pr.reasonNewFeature;
  }
  if (/営業|提案|案件|商談/i.test(text)) {
    return ui.pr.reasonSalesValue;
  }
  if (/マーケ|キャンペーン|認知/i.test(text)) {
    return ui.pr.reasonBrandAwareness;
  }

  const finding = result.research?.report?.keyFindings[0]?.trim();
  if (finding && finding.length <= 36) {
    return finding.replace(/[。．.!！?？]+$/, "");
  }

  return ui.pr.reasonDefault;
}

function derivePriority(result: OrchestrationResult, text: string): PrPriority {
  const score = result.qualityLoop?.currentScore ?? 0;

  if (/社内|ハンドブック|内部|議事録/i.test(text) && !/公開|リリース/i.test(text)) {
    return "low";
  }

  if (
    score >= 90 ||
    /リリース|新機能|連携|アップデート|google\s*drive/i.test(text)
  ) {
    return "high";
  }

  if (score >= 75) return "medium";
  return "medium";
}

function recommendChannel(id: PrChannelId, text: string): boolean {
  const isFeatureLaunch =
    /連携|統合|機能|追加|リリース|アップデート|google\s*drive|drive/i.test(
      text,
    );
  const isContent =
    /ブログ|記事|seo|コンテンツ|コラム|youtube/i.test(text);
  const isB2B = /営業|提案|b2b|企業向け|クライアント/i.test(text);
  const isNewsWorthy =
    /ニュース|プレス|発表|launch|ローンチ/i.test(text) || isFeatureLaunch;
  const isInternal = /社内|ハンドブック|内部資料|議事録/i.test(text);

  if (isInternal) {
    return id === "email";
  }

  switch (id) {
    case "x":
      return isFeatureLaunch || isContent || isNewsWorthy;
    case "blog":
      return isFeatureLaunch || isContent || /調査|レポート|分析/i.test(text);
    case "linkedin":
      return isFeatureLaunch || isB2B || isNewsWorthy;
    case "news":
      return isNewsWorthy && !isInternal;
    case "email":
      return isB2B || /ニュースレター|メール|告知/i.test(text);
    default:
      return false;
  }
}

function buildChannels(text: string): PrChannelRecommendation[] {
  return CHANNEL_ORDER.map((id) => ({
    id,
    label: CHANNEL_LABELS[id],
    recommended: recommendChannel(id, text),
  }));
}

function deriveSummary(result: OrchestrationResult): string {
  const fromFinal = result.finalResponse.trim().split("\n").find((line) => {
    const t = line.trim();
    return t.length > 20 && !t.startsWith("#") && !t.startsWith("-");
  });

  if (fromFinal && fromFinal.length <= 120) {
    return fromFinal.trim().replace(/[。．.!！?？]+$/, "") + "。";
  }

  const exec = result.research?.report?.executiveSummary?.trim();
  if (exec && exec.length <= 120) {
    return exec;
  }

  const firstLine = result.assignment.split("\n")[0]?.trim();
  if (firstLine) {
    return ui.pr.summaryFromAssignment(firstLine);
  }

  return ui.pr.summaryDefault;
}

/** Generate a planning-only PR review from completed workflow data. */
export function generatePrReview(result: OrchestrationResult): PrReview | null {
  if (!isCeoApprovedForPr(result)) {
    return null;
  }

  const text = corpus(result);
  const channels = buildChannels(text);
  const shouldShare = channels.some((c) => c.recommended);
  const strategy = generatePrStrategy(result, text, channels, shouldShare);

  return {
    shouldShare,
    summary: deriveSummary(result),
    headline: deriveHeadline(result),
    targetAudience: deriveTargetAudience(text),
    reason: deriveReason(result, text),
    priority: derivePriority(result, text),
    channels,
    strategy,
    extensions: PR_EXTENSION_STUBS,
  };
}
