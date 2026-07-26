import type { Deliverable } from "@/lib/orchestration/deliverable-types";

import type { QualityContextPack } from "./context-pack";
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

/** Rule-based independent Reviewer (always runs; LLM optional). */
export function runRulesQualityReviewer(input: {
  deliverable: Deliverable;
  kind: QualityPromptKind;
  brief: WriterBrief;
  contextPack: QualityContextPack;
}): QualityReviewerResult {
  const started = Date.now();
  const body = (input.deliverable.content || input.deliverable.markdown).trim();
  const issues: string[] = [];

  if (!input.deliverable.title.trim()) issues.push("タイトルが不足しています");
  if (body.length < 120) issues.push("本文の情報量が不足しています");
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
    input.contextPack.businessProfileSummary &&
    !/会社|当社|ブランド|サービス/.test(body) &&
    (input.kind === "sales_material" || input.kind === "proposal")
  ) {
    issues.push("Business Profile（会社情報）の反映が弱いです");
  }
  if (!/^#{1,3}\s+/m.test(input.deliverable.markdown || body)) {
    issues.push("見出し構成が不足しています");
  }

  const approved = issues.length === 0;
  return {
    approved,
    issues,
    feedback: approved
      ? "大きな問題は見つかりませんでした。"
      : `修正が必要です:\n- ${issues.join("\n- ")}`,
    durationMs: Date.now() - started,
    usedLlm: false,
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
  };
}
