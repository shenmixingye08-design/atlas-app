import type { WorkMemorySourceType, WorkMemoryType } from "./types";

/** User-facing type labels for the Work Memory management UI. */
export const WORK_MEMORY_TYPE_LABELS: Record<WorkMemoryType, string> = {
  workflow: "仕事",
  template: "テンプレート",
  habit: "習慣",
  correction: "改善",
  result: "資料",
  preference: "文章",
  outcome: "ルール",
};

export const WORK_MEMORY_SOURCE_LABELS: Record<WorkMemorySourceType, string> = {
  orchestration: "依頼の実行結果から学習",
  user_edit: "あなたが編集した内容から学習",
  user_explicit: "あなたが明示的に追加",
  correction_diff: "修正内容の差分から学習",
  reference_material: "参考資料から学習",
  repeated_request: "繰り返しの依頼から学習",
  manual: "手動で登録",
};

export function getWorkMemoryTypeLabel(type: WorkMemoryType): string {
  return WORK_MEMORY_TYPE_LABELS[type] ?? type;
}

export function getWorkMemorySourceLabel(source: WorkMemorySourceType): string {
  return WORK_MEMORY_SOURCE_LABELS[source] ?? source;
}

export function formatWorkMemoryConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}

export function formatWorkMemoryConfidencePercent(confidence: number): number {
  return Math.round(Math.min(1, Math.max(0, confidence)) * 100);
}
