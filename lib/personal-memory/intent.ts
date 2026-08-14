/**
 * Persist vs one-shot vs automation-only write intent.
 * Never invent a second Memory store — this only classifies user text.
 */

export type MemoryWriteIntent =
  | "one_shot"
  | "persist_global"
  | "persist_channel"
  | "automation_override"
  | "ambiguous";

const ONE_SHOT_RE =
  /今日だけ|きょうだけ|今回だけ|この(一回|1回)だけ|今だけ|とりあえず今回|今回は(短く|長く|なし)/;

const PERSIST_RE =
  /今後|これから|いつも|毎回|覚えて|このスタイルで続けて|引き続きこの|これから毎回/;

const AUTOMATION_ONLY_RE =
  /この自動化だけ|この仕事だけ|この投稿だけ|この習慣だけ|この依頼だけ/;

const GLOBAL_ALL_RE =
  /今後は?\s*全部|これから全部|全部(の)?(X|投稿|仕事)?|すべての(投稿|仕事|自動化)/;

export function isOneShotMemoryInstruction(text: string): boolean {
  return ONE_SHOT_RE.test(text.trim());
}

export function hasPersistentMemoryIntent(text: string): boolean {
  return PERSIST_RE.test(text.trim()) && !isOneShotMemoryInstruction(text);
}

export function isAutomationOnlyOverrideIntent(text: string): boolean {
  return AUTOMATION_ONLY_RE.test(text.trim());
}

export function isGlobalMemoryUpdateIntent(text: string): boolean {
  return GLOBAL_ALL_RE.test(text.trim()) && !isAutomationOnlyOverrideIntent(text);
}

export function classifyMemoryWriteIntent(text: string): MemoryWriteIntent {
  const trimmed = text.trim();
  if (!trimmed) return "ambiguous";
  if (isOneShotMemoryInstruction(trimmed)) return "one_shot";
  if (isAutomationOnlyOverrideIntent(trimmed)) return "automation_override";
  if (isGlobalMemoryUpdateIntent(trimmed) && hasPersistentMemoryIntent(trimmed)) {
    return "persist_global";
  }
  if (hasPersistentMemoryIntent(trimmed)) return "persist_channel";
  return "ambiguous";
}
