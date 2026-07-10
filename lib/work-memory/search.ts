import type { WorkMemoryRecord, WorkMemoryType } from "./types";

const TYPE_KEYWORDS: Record<WorkMemoryType, RegExp[]> = {
  workflow: [/手順|流れ|進め方|workflow|process|ステップ/i],
  preference: [/口調|文体|トーン|長さ|構成|デザイン|好み|preference/i],
  template: [/テンプレ|template|フォーマット|形式|雛形/i],
  habit: [/毎日|毎週|毎月|定期|習慣|ルーティン|habit/i],
  correction: [/修正|訂正|直して|変更|correction/i],
  result: [/資料|投稿|作成|成果|result|deliverable/i],
  outcome: [/反応|再生|クリック|支出|成果|outcome|kpi|cv/i],
};

const ASSIGNMENT_TYPE_HINTS: Array<{ pattern: RegExp; type: WorkMemoryType }> = [
  { pattern: /営業|資料|sales|ppt|pdf/i, type: "workflow" },
  { pattern: /sns|投稿|x\b|twitter|instagram/i, type: "template" },
  { pattern: /メール|mail|email/i, type: "preference" },
  { pattern: /ブログ|blog/i, type: "template" },
  { pattern: /毎日|毎週|毎月|定期|習慣/i, type: "habit" },
  { pattern: /分析|レポート|report/i, type: "result" },
];

export function scoreWorkMemoryRelevance(
  memory: WorkMemoryRecord,
  assignment: string,
): number {
  const text = assignment.toLowerCase();
  let score = memory.confidence;

  if (!memory.isActive) return -1;
  if (!memory.isUserConfirmed && memory.confidence < 0.55) score -= 0.15;

  for (const hint of ASSIGNMENT_TYPE_HINTS) {
    if (hint.pattern.test(text) && memory.type === hint.type) {
      score += 0.35;
    }
  }

  const titleLower = memory.title.toLowerCase();
  const summaryLower = memory.summary.toLowerCase();
  const assignmentTokens = text.split(/\s+/).filter((t) => t.length >= 2);

  for (const token of assignmentTokens) {
    if (titleLower.includes(token) || summaryLower.includes(token)) {
      score += 0.12;
    }
  }

  for (const tag of memory.tags) {
    if (text.includes(tag.toLowerCase())) score += 0.1;
  }

  if (memory.isUserConfirmed) score += 0.2;
  if (memory.usageCount > 0) score += Math.min(0.15, memory.usageCount * 0.02);

  const typePatterns = TYPE_KEYWORDS[memory.type] ?? [];
  if (typePatterns.some((pattern) => pattern.test(text))) {
    score += 0.1;
  }

  return score;
}

export function rankWorkMemoriesForAssignment(
  memories: readonly WorkMemoryRecord[],
  assignment: string,
  limit = 8,
): WorkMemoryRecord[] {
  const scored = memories
    .map((memory) => ({ memory, score: scoreWorkMemoryRelevance(memory, assignment) }))
    .filter((item) => item.score >= 0.35)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, limit).map((item) => item.memory);
}

export function filterWorkMemories(
  memories: readonly WorkMemoryRecord[],
  query: string,
  type?: WorkMemoryType | "all",
  activeOnly = true,
): WorkMemoryRecord[] {
  const normalizedQuery = query.trim().toLowerCase();

  return memories.filter((memory) => {
    if (activeOnly && !memory.isActive) return false;
    if (type && type !== "all" && memory.type !== type) return false;
    if (!normalizedQuery) return true;

    const haystack = [
      memory.title,
      memory.summary,
      memory.tags.join(" "),
      JSON.stringify(memory.structuredData),
    ]
      .join(" ")
      .toLowerCase();

    return haystack.includes(normalizedQuery);
  });
}

export function buildAssignmentFingerprint(assignment: string): string {
  const normalized = assignment
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

  const tokens = normalized
    .split(" ")
    .filter((token) => token.length >= 2)
    .slice(0, 8);

  return tokens.join("|") || normalized.slice(0, 40);
}
