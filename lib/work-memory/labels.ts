import type { WorkMemoryType } from "./types";

export const WORK_MEMORY_TYPE_LABELS: Record<WorkMemoryType, string> = {
  workflow: "仕事の進め方",
  preference: "文章・表現の好み",
  template: "資料・テンプレート",
  habit: "習慣・定期作業",
  correction: "修正から学んだこと",
  result: "完成した成果",
  outcome: "結果・評価",
};

export function getWorkMemoryTypeLabel(type: WorkMemoryType): string {
  return WORK_MEMORY_TYPE_LABELS[type] ?? type;
}

export function formatWorkMemoryConfidence(confidence: number): string {
  return `${Math.round(confidence * 100)}%`;
}
