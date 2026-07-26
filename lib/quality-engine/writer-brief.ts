import type { DeliverableType } from "@/lib/orchestration/deliverable-types";

import type { QualityContextPack } from "./context-pack";
import { resolveQualityPromptKind } from "./policy";
import { getSectionsForKind } from "./sections";
import type { WriterBrief } from "./types";

function inferAudience(assignment: string): string {
  if (/経営|役員|意思決定/i.test(assignment)) return "経営層";
  if (/顧客|クライアント|提案先/i.test(assignment)) return "取引先・見込み客";
  if (/社員|社内|メンバー/i.test(assignment)) return "社内メンバー";
  if (/読者|ブログ|一般/i.test(assignment)) return "一般読者";
  return "依頼内容の想定読者";
}

function inferTone(assignment: string, kind: WriterBrief["deliverableKind"]): string {
  if (kind === "email") return "宛先に合わせた丁寧な敬語";
  if (kind === "contract") return "正確で自然な法務調";
  if (kind === "sns") return "媒体に合うテンポの良い文体";
  if (/フォーマル|堅い|公式/i.test(assignment)) return "フォーマル";
  if (/カジュアル|親しみ/i.test(assignment)) return "カジュアル";
  if (/営業|提案|説得/i.test(assignment)) return "説得力のあるビジネストーン";
  if (/ブログ|読みやすく/i.test(assignment)) return "読みやすい解説調";
  return "プロフェッショナルで自然な日本語";
}

function inferPurpose(
  assignment: string,
  kind: WriterBrief["deliverableKind"],
): string {
  switch (kind) {
    case "sales_material":
    case "proposal":
      return "意思決定・商談を前進させる";
    case "planning":
      return "企画の合意と実行準備";
    case "blog":
      return "読者に価値ある情報を届ける";
    case "contract":
      return "権利義務を明確にする";
    case "estimate":
      return "見積条件を明確に伝える";
    case "invoice":
      return "請求内容を正確に伝える";
    case "sns":
      return "反応を得られる投稿を用意する";
    case "receipt":
      return "家計・経費記録を正確にする";
    case "minutes":
      return "決定事項と宿題を正確に残す";
    case "email":
      return "用件を伝え、返信しやすくする";
    case "excel":
      return "実務で使える表を用意する";
    case "word":
    case "pdf":
      return "読みやすい文書を完成させる";
    default:
      return assignment.trim().slice(0, 120) || "依頼を完了する";
  }
}

/**
 * Planner does not write prose — this brief is the structured handoff to Writer.
 * Built deterministically from assignment + context (no extra LLM).
 */
export function buildWriterBrief(input: {
  assignment: string;
  deliverableType: DeliverableType | string;
  planSummary?: string | null;
  metadata?: Readonly<Record<string, unknown>> | null;
  contextPack: QualityContextPack;
}): WriterBrief {
  const kind = resolveQualityPromptKind({
    assignment: input.assignment,
    deliverableType: input.deliverableType,
    metadata: input.metadata,
  });
  const sections = getSectionsForKind(kind);

  return {
    assignmentSummary: input.assignment.trim().slice(0, 500),
    deliverableKind: kind,
    deliverableType: input.deliverableType as DeliverableType,
    purpose: inferPurpose(input.assignment, kind),
    audience: inferAudience(input.assignment),
    tone: inferTone(input.assignment, kind),
    pageStructure: sections.map((s) => s.title),
    requiredSections: sections.map((s) => s.id),
    businessProfileSummary: input.contextPack.businessProfileSummary,
    visionSummary: input.contextPack.visionSummary,
    userSettingsSummary: input.contextPack.userSettingsSummary,
    templateId: input.contextPack.templateId,
    pastDeliverableHints: input.contextPack.pastDeliverableHints,
    referenceSummary: input.contextPack.reference.summary,
  };
}

export function formatWriterBriefForPrompt(brief: WriterBrief): string {
  return [
    "Writer Brief（Planner整理・本文は書かない）:",
    `依頼: ${brief.assignmentSummary}`,
    `成果物種類: ${brief.deliverableKind}`,
    `利用目的: ${brief.purpose}`,
    `読者: ${brief.audience}`,
    `トーン: ${brief.tone}`,
    `ページ構成: ${brief.pageStructure.join(" → ")}`,
    `必須セクション: ${brief.requiredSections.join(", ")}`,
    brief.businessProfileSummary
      ? `Business Profile: ${brief.businessProfileSummary.slice(0, 600)}`
      : "",
    brief.visionSummary
      ? `Vision: ${brief.visionSummary.slice(0, 600)}`
      : "",
    brief.userSettingsSummary
      ? `ユーザー設定: ${brief.userSettingsSummary.slice(0, 400)}`
      : "",
    brief.pastDeliverableHints
      ? `過去成果物参考: ${brief.pastDeliverableHints.slice(0, 500)}`
      : "",
    brief.referenceSummary
      ? `参考資料: ${brief.referenceSummary.slice(0, 700)}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}
