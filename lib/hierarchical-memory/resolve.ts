import { HIERARCHICAL_MEMORY_QUALITY_EVALUATION } from "./feature-evaluation";
import { listStoredHierarchicalMemories } from "./store";
import type {
  HierarchicalMemoryRecord,
  MemoryResolveContext,
  MemoryScope,
  ResolvedMemoryBundle,
} from "./types";

const SCOPE_RANK: Record<MemoryScope, number> = {
  conversation: 400,
  job: 300,
  project: 200,
  user: 100,
};

function isUsable(
  memory: HierarchicalMemoryRecord,
  context: MemoryResolveContext,
  now: Date,
): boolean {
  if (memory.status !== "active") return false;
  if (memory.userId !== context.userId) return false;
  if (memory.expiresAt && new Date(memory.expiresAt).getTime() <= now.getTime()) {
    return false;
  }
  if (memory.scope === "project") {
    if (!context.projectId || memory.projectId !== context.projectId) return false;
  }
  if (memory.scope === "job") {
    const jobMatch =
      (context.jobId && memory.jobId === context.jobId) ||
      (context.automationId && memory.automationId === context.automationId);
    if (!jobMatch) return false;
  }
  if (memory.scope === "conversation" && memory.isTemporary) {
    // temporary conversation memories only apply within expiry window (already checked)
  }
  return true;
}

function relevanceScore(
  memory: HierarchicalMemoryRecord,
  assignment: string,
): number {
  const text = assignment.toLowerCase();
  const hay = `${memory.key} ${memory.value} ${memory.category}`.toLowerCase();
  let score = memory.priority + memory.confidence * 10 + memory.useCount;
  if (memory.source === "explicit_user_instruction") score += 40;
  if (memory.source === "system_inference") score -= 20;
  for (const token of hay.split(/[\s、。,/]+/).filter((t) => t.length >= 2)) {
    if (text.includes(token)) score += 8;
  }
  // Decay stale low-confidence memories
  if (memory.lastUsedAt) {
    const days =
      (Date.now() - new Date(memory.lastUsedAt).getTime()) / (86400 * 1000);
    if (days > 60 && memory.confidence < 0.6) score -= 25;
  }
  return score;
}

/**
 * Priority: current request overrides memory (applied by caller).
 * Among memories: conversation > job > project > user.
 * Same key → highest scope rank wins (lower scopes dropped).
 */
export function resolveHierarchicalMemories(
  context: MemoryResolveContext,
): ResolvedMemoryBundle {
  const now = context.now ?? new Date();
  const all = listStoredHierarchicalMemories(context.userId).filter((memory) =>
    isUsable(memory, context, now),
  );

  const ranked = [...all].sort((a, b) => {
    const scopeDiff = SCOPE_RANK[b.scope] - SCOPE_RANK[a.scope];
    if (scopeDiff !== 0) return scopeDiff;
    return relevanceScore(b, context.assignment) - relevanceScore(a, context.assignment);
  });

  const byKey = new Map<string, HierarchicalMemoryRecord>();
  const excludedIds: string[] = [];
  for (const memory of ranked) {
    // Current request overrides conflicting memories
    if (contradictsCurrentRequest(memory, context.assignment)) {
      excludedIds.push(memory.id);
      continue;
    }
    const existing = byKey.get(memory.key);
    if (!existing) {
      byKey.set(memory.key, memory);
      continue;
    }
    // Higher scope already placed (sorted desc) → exclude lower
    excludedIds.push(memory.id);
  }

  const selected = [...byKey.values()]
    .sort(
      (a, b) =>
        relevanceScore(b, context.assignment) - relevanceScore(a, context.assignment),
    )
    .slice(0, HIERARCHICAL_MEMORY_QUALITY_EVALUATION.maxMemoriesInPrompt);

  const temporary = selected.filter((memory) => memory.isTemporary);
  const applied = selected.filter((memory) => !memory.isTemporary);

  const lines = selected.map((memory) => {
    const scopeLabel =
      memory.scope === "user"
        ? "全体"
        : memory.scope === "project"
          ? "プロジェクト"
          : memory.scope === "job"
            ? "仕事"
            : "今回のみ";
    return `- [${scopeLabel}/${memory.category}] ${memory.key}: ${memory.value}`;
  });

  let promptBlock = [
    "【適用する記憶】（優先順位: 今回の明示指示 > 仕事 > プロジェクト > ユーザー全体）",
    ...lines,
  ].join("\n");

  if (promptBlock.length > HIERARCHICAL_MEMORY_QUALITY_EVALUATION.maxPromptChars) {
    promptBlock = `${promptBlock.slice(0, HIERARCHICAL_MEMORY_QUALITY_EVALUATION.maxPromptChars)}\n[...truncated]`;
  }

  return {
    applied,
    temporary,
    promptBlock: selected.length > 0 ? promptBlock : "",
    usedIds: selected.map((memory) => memory.id),
    excludedIds,
  };
}

export function buildHierarchicalMemoryMetadata(
  bundle: ResolvedMemoryBundle,
): Record<string, string> | null {
  if (!bundle.promptBlock) return null;
  return {
    hierarchicalMemory: bundle.promptBlock,
    hierarchicalMemoryIds: bundle.usedIds.join(","),
  };
}

export function readHierarchicalMemoryFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): string | null {
  const raw = metadata?.hierarchicalMemory;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

/** Drop memories that conflict with this request's explicit instructions. */
export function contradictsCurrentRequest(
  memory: HierarchicalMemoryRecord,
  assignment: string,
): boolean {
  const a = assignment.toLowerCase();
  const v = memory.value.toLowerCase();

  const pairs: Array<[RegExp, RegExp]> = [
    [/絵文字.*(少な|控えめ|なし|使わない)/, /絵文字.*(多|たくさん|多め)/],
    [/絵文字.*(多|たくさん|多め)/, /絵文字.*(少な|控えめ|なし|使わない)/],
    [/ハッシュタグ.*(少な|なし|不要|使わない)/, /ハッシュタグ.*(多|たくさん|多め)/],
    [/敬語|フォーマル|丁寧/, /カジュアル|砕け|タメ口/],
    [/カジュアル|砕け|タメ口/, /敬語|フォーマル|丁寧/],
  ];

  for (const [assignmentPattern, memoryPattern] of pairs) {
    if (assignmentPattern.test(a) && memoryPattern.test(v)) return true;
  }
  return false;
}
