import { COMPACT_DELIVERABLE_JSON } from "@/lib/prompts/workflow/compact-prompts";
import type { WorkTask } from "@/lib/agents/tasks/types";

import { formatContextPackForPrompt, type QualityContextPack } from "./context-pack";
import { formatSectionsForPrompt } from "./sections";
import type { QualityPromptKind, WriterBrief } from "./types";
import { formatWriterBriefForPrompt } from "./writer-brief";

const KIND_INSTRUCTIONS: Record<QualityPromptKind, string> = {
  sales_material:
    "営業資料。表紙→会社紹介→課題→提案→メリット→料金→まとめ。捏造数値禁止。Business Profileを反映。",
  contract:
    "契約書。条項を明確に。曖昧な義務は避け、不明点は【要確認】。法的断定をしすぎない。",
  invoice:
    "請求書。明細・税・合計を構造化。不明な金額は捏造せず【要確認】。",
  report:
    "レポート。結論先出し。根拠・提言・リスクを整理。",
  proposal:
    "提案書。課題→提案→計画→期待効果。説得力と実現性のバランス。",
  blog:
    "ブログ記事。導入→見出し付き本文→具体例→まとめ。SEO title/description/tags/snsPostも埋める。",
  sns:
    "SNS投稿。3〜5本。トーン統一。過度なハッシュタグ禁止。",
  excel:
    "表データ。列定義と行データを明確に。計算前提を注記。",
  word:
    "Word文書。見出し階層を整え、読みやすい段落構成。",
  pdf:
    "PDF向け文書。表紙・本文・まとめ。印刷しても読みやすい構成。",
  receipt:
    "レシート/家計簿。Vision結果と矛盾禁止。日付・店名・金額・科目。",
  generic:
    "成果物。目的・読者・次アクションを明確に。自然な日本語。",
};

/** Dedicated Writer prompt — section-structured generation (one structured call). */
export function buildSectionedWriterPrompt(input: {
  kind: QualityPromptKind;
  tasks: readonly WorkTask[];
  brief: WriterBrief;
  contextPack: QualityContextPack;
}): string {
  const taskList = input.tasks
    .map((t) => `${t.id}. ${t.title}: ${t.description}`)
    .join("\n");

  return [
    `Deliverable prompt family: ${input.kind}`,
    KIND_INSTRUCTIONS[input.kind],
    formatWriterBriefForPrompt(input.brief),
    formatContextPackForPrompt(input.contextPack),
    `Generate SECTION BY SECTION in this order:\n${formatSectionsForPrompt(input.kind)}`,
    `Tasks:\n${taskList || "(unified deliverable)"}`,
    "Rules:",
    "- Do not invent facts that contradict Business Profile or Vision.",
    "- Past deliverables are reference only — never copy verbatim.",
    "- Fill markdown with ## headings matching each section title.",
    "- Also include sections:[{id,title,content}] in the JSON when possible.",
    COMPACT_DELIVERABLE_JSON.replace(
      "Return ONLY valid JSON:",
      "Return ONLY valid JSON (include optional sections[]):",
    ),
  ].join("\n\n");
}

export function buildQualityReviewerPrompt(input: {
  kind: QualityPromptKind;
  markdown: string;
  brief: WriterBrief;
  contextPack: QualityContextPack;
}): string {
  return [
    "You are an independent Reviewer (do not rewrite the whole document).",
    `Kind: ${input.kind}`,
    "Check: typos, readability, logic, consistency, Business Profile fit, Vision fit, structure, natural Japanese, missing info, duplication.",
    formatWriterBriefForPrompt(input.brief),
    formatContextPackForPrompt(input.contextPack),
    `Deliverable:\n${input.markdown.slice(0, 4_500)}`,
    'Return ONLY JSON: {"approved":boolean,"issues":string[],"feedback":string}',
  ].join("\n\n");
}

export function buildQualityJudgePrompt(input: {
  kind: QualityPromptKind;
  markdown: string;
}): string {
  return [
    "You are Quality Judge. Score 0-100 for each criterion and overall.",
    `Kind: ${input.kind}`,
    "Criteria: completeness, readability, persuasiveness, naturalness, expertise, design, structure, information.",
    `Deliverable:\n${input.markdown.slice(0, 4_500)}`,
    'Return ONLY JSON: {"overallScore":number,"criteria":{"completeness":n,"readability":n,"persuasiveness":n,"naturalness":n,"expertise":n,"design":n,"structure":n,"information":n},"feedback":string,"weakSections":string[]}',
  ].join("\n\n");
}

export function buildQualityImprovePrompt(input: {
  kind: QualityPromptKind;
  feedback: string;
  weakSections: readonly string[];
}): string {
  return [
    `Deliverable kind: ${input.kind}`,
    "Improve the COMPLETE deliverable JSON based on Judge/Reviewer feedback.",
    `Weak sections: ${input.weakSections.join(", ") || "(general)"}`,
    `Feedback:\n${input.feedback.slice(0, 2_000)}`,
    "Keep Business Profile / Vision consistency. No fabricated facts.",
    "Regenerate section-by-section headings in markdown.",
    COMPACT_DELIVERABLE_JSON,
  ].join("\n\n");
}

/** Planner prompt addendum — organize only, never write the deliverable body. */
export function buildPlannerQualityAddendum(kind: QualityPromptKind): string {
  return [
    "Planner rules: do NOT write the final deliverable body.",
    `Organize for Writer (${kind}): purpose, audience, tone, page structure, required sections, profile/vision/settings notes.`,
    "Return JSON including plan + tasks only.",
  ].join(" ");
}
