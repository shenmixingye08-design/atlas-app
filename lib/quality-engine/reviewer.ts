import type { Deliverable } from "@/lib/orchestration/deliverable-types";

import type { QualityContextPack } from "./context-pack";
import { getSpecialistProfile } from "./specialists";
import type { QualityPromptKind, QualityReviewerResult, WriterBrief } from "./types";

function extractJson(output: string): Record<string, unknown> | null {
  const fenced = output.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = (fenced?.[1] ?? output).trim();
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function runSpecialistChecks(
  kind: QualityPromptKind,
  deliverable: Deliverable,
  body: string,
  md: string,
): string[] {
  const issues: string[] = [];
  switch (kind) {
    case "sales_material":
      if (!/課題/.test(body)) issues.push("課題セクションが弱いです");
      if (!/メリット|効果|利点/.test(body)) issues.push("メリットが不明瞭です");
      if (!/CTA|お問い合わせ|ご相談|次の|ご連絡|ご検討/i.test(body)) {
        issues.push("CTA（次のアクション）が不足しています");
      }
      break;
    case "blog":
      if ((md.match(/^#{2,3}\s+/gm) ?? []).length < 2) {
        issues.push("SEO向け見出しが不足しています");
      }
      if (!deliverable.metadata.seo?.title?.trim()) {
        issues.push("SEOタイトルが不足しています");
      }
      if (!/まとめ/.test(body)) issues.push("まとめが不足しています");
      break;
    case "contract":
      if (!/第\s*\d+\s*条|第[一二三四五六七八九十]+条/.test(body)) {
        issues.push("条項番号の体裁が不足しています");
      }
      if (!/解除|責任|定義/.test(body)) {
        issues.push("条項漏れの可能性があります（定義/責任/解除）");
      }
      break;
    case "excel":
      if (!/列|項目/.test(body)) issues.push("列構成が不足しています");
      if (!/数式|=|SUM|AVERAGE/i.test(body)) {
        issues.push("数式・計算の指針が不足しています");
      }
      break;
    case "word":
      if ((md.match(/^#{1,3}\s+/gm) ?? []).length < 2) {
        issues.push("見出し階層が不足しています");
      }
      if (!/^\s*[-*]\s/m.test(md) && !/\|/.test(md)) {
        issues.push("箇条書きまたは表の活用が不足しています");
      }
      break;
    case "pdf":
      if (!/表紙|まとめ/.test(body)) {
        issues.push("ページ構成（表紙/まとめ）が不足しています");
      }
      break;
    case "email":
      if (!/件名/.test(body) && !deliverable.title.trim()) {
        issues.push("件名が不足しています");
      }
      if (body.length > 2_000) issues.push("本文が長く、返信しづらい可能性があります");
      break;
    case "minutes":
      if (!/決定/.test(body)) issues.push("決定事項が不足しています");
      if (!/宿題|アクション|担当|期限/.test(body)) {
        issues.push("宿題（担当・期限）が不足しています");
      }
      break;
    case "estimate":
      if (!/有効|前提|明細|合計/.test(body)) {
        issues.push("見積の必須要素（明細/前提/合計）が不足しています");
      }
      break;
    case "invoice":
      if (!/明細|合計|支払|振込/.test(body)) {
        issues.push("請求書の必須要素が不足しています");
      }
      break;
    default:
      break;
  }
  return issues;
}

/** Specialist Reviewer (rules) — checklist differs by deliverable kind. */
export function runRulesQualityReviewer(input: {
  deliverable: Deliverable;
  kind: QualityPromptKind;
  brief: WriterBrief;
  contextPack: QualityContextPack;
}): QualityReviewerResult {
  const started = Date.now();
  const specialist = getSpecialistProfile(input.kind);
  const body = (input.deliverable.content || input.deliverable.markdown).trim();
  const md = input.deliverable.markdown || body;
  const issues: string[] = [];

  if (!input.deliverable.title.trim() && input.kind !== "email") {
    issues.push("タイトルが不足しています");
  }
  if (body.length < 80) issues.push("本文の情報量が不足しています");
  if ((body.match(/(.{12,})\1{2,}/) ?? null)) {
    issues.push("重複した文言が目立ちます");
  }
  if (/TODO|TBD|lorem ipsum|ここに.*記入/i.test(body)) {
    issues.push("未完成のプレースホルダが残っています");
  }
  if (
    input.contextPack.visionSummary &&
    /Vision|画像/.test(input.brief.assignmentSummary) &&
    body.length < 80
  ) {
    issues.push("Vision結果を十分に反映できていません");
  }
  if (
    input.contextPack.reference.hasReferences &&
    input.contextPack.reference.summary &&
    body.length < 100
  ) {
    issues.push("参考資料の構成ヒントを十分に活かせていません");
  }
  if (
    input.contextPack.businessProfileSummary &&
    !/会社|当社|ブランド|サービス/.test(body) &&
    (input.kind === "sales_material" || input.kind === "proposal")
  ) {
    issues.push("Business Profile（会社情報）の反映が弱いです");
  }
  if (
    input.kind !== "email" &&
    input.kind !== "sns" &&
    !/^#{1,3}\s+/m.test(md)
  ) {
    issues.push("見出し構成が不足しています");
  }

  issues.push(...runSpecialistChecks(input.kind, input.deliverable, body, md));

  const approved = issues.length === 0;
  return {
    approved,
    issues,
    feedback: approved
      ? `${specialist.label}: 大きな問題は見つかりませんでした。`
      : `${specialist.label}の修正観点:\n- ${issues.join("\n- ")}`,
    durationMs: Date.now() - started,
    usedLlm: false,
    specialistLabel: specialist.label,
  };
}

export function parseLlmQualityReviewer(
  output: string,
  fallback: QualityReviewerResult,
): QualityReviewerResult {
  const parsed = extractJson(output);
  if (!parsed) {
    return { ...fallback, usedLlm: true };
  }
  const issues = Array.isArray(parsed.issues)
    ? parsed.issues.map(String).slice(0, 12)
    : fallback.issues;
  const approved =
    typeof parsed.approved === "boolean" ? parsed.approved : issues.length === 0;
  return {
    approved,
    issues,
    feedback:
      typeof parsed.feedback === "string" && parsed.feedback.trim()
        ? parsed.feedback.trim()
        : fallback.feedback,
    durationMs: fallback.durationMs,
    usedLlm: true,
    specialistLabel: fallback.specialistLabel,
  };
}
