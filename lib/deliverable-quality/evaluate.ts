import type { Deliverable } from "@/lib/orchestration/deliverable-types";

import type {
  DeliveryStatus,
  MajorErrorCode,
  QualityArtifactKind,
  QualityEvaluation,
  QualityIssue,
} from "./types";

function mapKind(type: string, assignment: string): QualityArtifactKind {
  const text = `${type} ${assignment}`.toLowerCase();
  if (type === "social_post" || /\bx\b|tweet|ツイート/.test(text)) return "x_post";
  if (/instagram|tiktok|sns/.test(text)) return "sns_post";
  if (type === "email" || /メール/.test(text)) return "email";
  if (type === "blog") return "blog";
  if (type === "proposal" || type === "presentation" || /営業|提案/.test(text)) {
    return "sales_doc";
  }
  if (/xlsx|excel/.test(text)) return "excel";
  if (/pptx|powerpoint|スライド/.test(text)) return "powerpoint";
  if (/pdf/.test(text)) return "pdf";
  if (/docx|word/.test(text)) return "word";
  if (/契約|法務|規約/.test(text)) return "legal";
  if (type === "report" || type === "research") return "report";
  if (/台本|動画/.test(text)) return "video_script";
  return "general_text";
}

function bandFor(score: number): QualityEvaluation["band"] {
  if (score >= 90) return "ready";
  if (score >= 80) return "auto_revise";
  if (score >= 70) return "must_revise";
  return "replan";
}

function push(
  issues: QualityIssue[],
  code: string,
  message: string,
  major = false,
  majorCode?: MajorErrorCode,
  location?: string,
): void {
  issues.push({ code, message, major, majorCode, location });
}

/** Type-aware quality evaluation with major-error veto (no fake pass). */
export function evaluateDeliverableQuality(input: {
  deliverable: Deliverable;
  assignment: string;
  baseScore?: number;
  baseFailedChecks?: string[];
}): QualityEvaluation {
  const { deliverable, assignment } = input;
  const kind = mapKind(deliverable.type, assignment);
  const issues: QualityIssue[] = [];
  const body = (
    deliverable.content ||
    deliverable.markdown ||
    deliverable.plainText ||
    ""
  ).trim();

  if (!body) {
    push(issues, "empty", "成果物が空です", true, "empty_deliverable");
  }
  if (!deliverable.title.trim()) {
    push(issues, "title", "タイトルがありません");
  }

  // Instruction adherence (lightweight lexical overlap for required phrases)
  const mustKeep = assignment.match(/「([^」]{2,40})」/g)?.map((s) => s.slice(1, -1)) ?? [];
  for (const phrase of mustKeep) {
    if (phrase && !body.includes(phrase)) {
      push(
        issues,
        "instruction",
        `指示の「${phrase}」が反映されていません`,
        true,
        "instruction_ignored",
        "body",
      );
    }
  }

  if (/api[_-]?key|password|sk-live|sk-test/i.test(body)) {
    push(issues, "secret", "機密情報の漏えいの可能性があります", true, "secret_leak");
  }

  if (kind === "x_post" || kind === "sns_post") {
    if (body.length > 280) {
      push(issues, "length", "投稿文が長すぎます（目安280文字）", false, undefined, "body");
    }
    if ((body.match(/#/g) ?? []).length > 3) {
      push(issues, "hashtags", "ハッシュタグが多すぎます");
    }
    if (!body.slice(0, 40).trim()) {
      push(issues, "hook", "冒頭の引きが弱い可能性があります");
    }
  }

  if (kind === "email") {
    if (!deliverable.metadata.subject?.trim() && !/件名|subject/i.test(body)) {
      push(issues, "subject", "件名が不明です");
    }
    if (body.length < 40) {
      push(issues, "thin", "本文が短すぎます");
    }
  }

  if (kind === "excel") {
    if (/#REF!|#DIV\/0!|#VALUE!/i.test(body)) {
      push(issues, "formula", "Excel数式エラーが含まれています", true, "excel_formula_error");
    }
  }

  if (kind === "powerpoint") {
    const longBlocks = body.split(/\n{2,}/).filter((block) => block.length > 400);
    if (longBlocks.length > 0) {
      push(issues, "slide_text", "1スライドあたりの文字量が多すぎる可能性があります", true, "pptx_overflow");
    }
  }

  if (kind === "pdf" && /ï¿½|����|文字化け/.test(body)) {
    push(issues, "mojibake", "文字化けの可能性があります", true, "pdf_mojibake");
  }

  if (kind === "legal") {
    if (!/当事者|甲|乙|株式会社/.test(body)) {
      push(issues, "legal_party", "法的文書の当事者情報が不足しています", true, "legal_missing");
    }
  }

  for (const check of input.baseFailedChecks ?? []) {
    push(issues, "base_qa", check);
  }

  const majorErrors = [
    ...new Set(
      issues
        .filter((issue) => issue.major && issue.majorCode)
        .map((issue) => issue.majorCode!),
    ),
  ];

  let overallScore =
    typeof input.baseScore === "number"
      ? input.baseScore
      : Math.max(0, 100 - issues.length * 8 - majorErrors.length * 20);

  // Major error veto — high average cannot pass
  if (majorErrors.length > 0) {
    overallScore = Math.min(overallScore, 69);
  }

  overallScore = Math.max(0, Math.min(100, Math.round(overallScore)));
  const band = bandFor(overallScore);
  const passed = majorErrors.length === 0 && overallScore >= 90;

  let deliveryStatus: DeliveryStatus = "completed";
  if (majorErrors.includes("empty_deliverable")) deliveryStatus = "failed";
  else if (!passed && (band === "must_revise" || band === "replan" || majorErrors.length > 0)) {
    deliveryStatus = "needs_review";
  } else if (!passed && band === "auto_revise") {
    deliveryStatus = "revising";
  }

  const revisionBrief = buildRevisionBrief(issues, majorErrors, body);

  return {
    kind,
    overallScore,
    passed,
    band,
    issues,
    majorErrors,
    revisionBrief,
    deliveryStatus,
  };
}

function buildRevisionBrief(
  issues: QualityIssue[],
  majorErrors: MajorErrorCode[],
  body: string,
): string {
  const lines = [
    "【品質評価フィードバック】",
    `重大エラー: ${majorErrors.length > 0 ? majorErrors.join(", ") : "なし"}`,
    "問題点:",
    ...issues.slice(0, 8).map((issue) => `- ${issue.message}${issue.location ? ` (${issue.location})` : ""}`),
    "修正指示:",
    "- 上記問題のみ修正し、正しい内容・トーン・構成は維持してください",
    "- 空の成果物や形式違反を解消してください",
    "- ユーザー指示と矛盾する内容を追加しないでください",
    "維持すべき部分:",
    `- 本文の主題と、問題のない段落（先頭 ${Math.min(120, body.length)} 文字の意図）`,
  ];
  return lines.join("\n");
}

export function mergeQualityIntoDeterministicFeedback(
  evaluation: QualityEvaluation,
  existingFeedback: string,
): string {
  if (evaluation.passed) return existingFeedback;
  return [existingFeedback, evaluation.revisionBrief].filter(Boolean).join("\n\n");
}
