import type { DeliverableType } from "./deliverable-types";
import type { WorkTask } from "./types";

/** Classify deliverable type from the user request (canonical planner/worker hint). */
export function classifyDeliverableType(assignment: string, taskText = ""): DeliverableType {
  const combined = `${assignment} ${taskText}`;
  const haystack = combined.toLowerCase();

  if (/営業資料|sales\s*deck|pitch\s*deck|プレゼン資料|提案資料|スライド資料/.test(combined)) {
    return "presentation";
  }
  if (/営業メール|sales\s*email|セールスメール|提案メール|フォローアップメール|見積メール/.test(combined)) {
    return "email";
  }
  if (/メール|email|e-mail|mail|gmail|newsletter|メール文|メールを/.test(haystack)) {
    return "email";
  }
  if (/sns|ツイート|twitter|x投稿|social\s*post|投稿文|ソーシャル/.test(haystack)) {
    return "document";
  }
  if (/ブログ|blog|記事|コラム|wordpress/.test(haystack)) {
    return "blog";
  }
  if (/報告書|レポート|report|whitepaper|白書/.test(haystack)) {
    return "report";
  }
  if (/提案|proposal|pitch|提案書/.test(haystack)) {
    return "proposal";
  }
  if (/プレゼン|presentation|slide|スライド|ppt/.test(haystack)) {
    return "presentation";
  }
  if (/調査|research|リサーチ|市場分析|競合分析/.test(haystack)) {
    return "research";
  }
  return "document";
}

const TASK_PATTERNS: Record<DeliverableType, RegExp> = {
  email: /メール|email|mail|営業|フォロー|見積|挨拶文/i,
  social_post: /sns|投稿|social|ツイート|x投稿/i,
  short_document: /紹介|短文|ドキュメント|document|サービス/i,
  blog: /ブログ|blog|記事|seo|コラム|投稿/i,
  report: /レポート|report|報告/i,
  proposal: /提案|proposal|pitch/i,
  presentation: /プレゼン|presentation|slide|スライド/i,
  research: /調査|research|リサーチ|分析/i,
  document: /./,
};

const CONFLICTING_PATTERNS: Partial<Record<DeliverableType, RegExp>> = {
  email: /ブログ|blog|記事|seo|sns投稿|コラム|wordpress/i,
  blog: /営業メール|sales email|メール本文|email draft/i,
};

export type PlannerPlanValidation = {
  ok: boolean;
  message?: string;
};

/** Stop when classified deliverable type conflicts with planner task titles. */
export function validatePlannerPlanConsistency(
  assignment: string,
  deliverableType: DeliverableType,
  tasks: readonly WorkTask[],
  plannerDeliverableType?: string,
): PlannerPlanValidation {
  if (tasks.length === 0) {
    return { ok: false, message: "Planner returned no tasks." };
  }

  const normalizedPlannerType = normalizeDeliverableType(plannerDeliverableType);
  if (
    normalizedPlannerType &&
    normalizedPlannerType !== deliverableType &&
    !typesCompatible(normalizedPlannerType, deliverableType)
  ) {
    return {
      ok: false,
      message: "依頼内容と作業計画が一致しませんでした。再実行してください。",
    };
  }

  const taskBlob = tasks.map((t) => `${t.title} ${t.description}`).join("\n");
  const expectedPattern = TASK_PATTERNS[deliverableType];
  const conflictPattern = CONFLICTING_PATTERNS[deliverableType];

  if (conflictPattern?.test(taskBlob) && !expectedPattern.test(taskBlob)) {
    return {
      ok: false,
      message: "依頼内容と作業計画が一致しませんでした。再実行してください。",
    };
  }

  if (
    deliverableType === "email" &&
    /ブログ|blog|記事|seo/i.test(taskBlob) &&
    !/メール|email|営業/i.test(taskBlob)
  ) {
    return {
      ok: false,
      message: "依頼内容と作業計画が一致しませんでした。再実行してください。",
    };
  }

  if (!expectedPattern.test(taskBlob) && !expectedPattern.test(assignment)) {
    return { ok: true };
  }

  return { ok: true };
}

export function normalizeDeliverableType(value: string | undefined): DeliverableType | null {
  if (!value?.trim()) return null;
  const raw = value.trim().toLowerCase().replace(/-/g, "_");
  const aliases: Record<string, DeliverableType> = {
    email: "email",
    sales_email: "email",
    mail: "email",
    blog: "blog",
    report: "report",
    proposal: "proposal",
    presentation: "presentation",
    research: "research",
    document: "document",
    social_post: "social_post",
    short_document: "short_document",
    sns: "social_post",
  };
  return aliases[raw] ?? null;
}

function typesCompatible(a: DeliverableType, b: DeliverableType): boolean {
  return a === b;
}

export function deliverableTypesMatch(
  expected: DeliverableType,
  actual: DeliverableType | string | undefined,
): boolean {
  const normalized = normalizeDeliverableType(actual) ?? classifyDeliverableType(String(actual ?? ""));
  return normalized === expected;
}

/** Keywords that indicate knowledge is for a different deliverable category. */
export function knowledgeConflictsWithDeliverableType(
  entryText: string,
  deliverableType: DeliverableType,
): boolean {
  const haystack = entryText.toLowerCase();

  if (deliverableType === "email") {
    return (
      /blog|seo|記事|ブログ|trend|トレンド|sns投稿|コラム|wordpress|markdown見出し|キーワード最適化/.test(
        haystack,
      ) && !/メール|email|営業|mail|フォロー|件名/.test(haystack)
    );
  }

  if (deliverableType === "blog") {
    return (
      /営業メール|sales email|件名:|メール本文|フォローアップメール/.test(haystack) &&
      !/blog|記事|seo|ブログ/.test(haystack)
    );
  }

  if (deliverableType === "document") {
    return (
      /営業メール|sales email|件名:|ブログ運用|seoキーワード|markdown見出し/.test(haystack) &&
      !/sns|投稿|social|ツイート|document|ドキュメント/.test(haystack)
    );
  }

  return false;
}

/** Classify a knowledge entry's deliverable type from metadata and content. */
export function classifyKnowledgeEntryType(
  entry: { title: string; summary: string; content?: string; tags: readonly string[]; assignmentHint?: string; category: string },
): DeliverableType | null {
  if (entry.assignmentHint?.trim()) {
    return classifyDeliverableType(entry.assignmentHint);
  }

  if (entry.category === "research") return "research";

  for (const tag of entry.tags) {
    const fromTag = classifyDeliverableType(tag);
    if (fromTag !== "document") return fromTag;
  }

  const text = [entry.title, entry.summary, entry.content ?? ""].join(" ");
  const fromText = classifyDeliverableType(text);
  return fromText === "document" ? null : fromText;
}

/** Whether a knowledge entry type is compatible with the current request type. */
export function deliverableTypesRelated(
  requestType: DeliverableType,
  entryType: DeliverableType | null,
): boolean {
  if (!entryType) return true;
  if (requestType === entryType) return true;
  if (requestType === "blog" && entryType === "research") return true;
  if (requestType === "report" && entryType === "research") return true;
  return false;
}
