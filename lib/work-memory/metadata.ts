import { ATLAS_MEMORY_PRIORITIES } from "@/lib/atlas-personality";

import { getWorkMemoryTypeLabel } from "./labels";
import type { WorkMemoryRecord, WorkMemorySummary } from "./types";

const MAX_PLANNER_CHARS = 1_800;

export function buildWorkMemoryInjectionHeader(): string {
  return [
    "お客様専用の仕事の記憶（Work Memory）— 再利用可能な業務情報のみ反映してください:",
    `優先対象: ${ATLAS_MEMORY_PRIORITIES.join("、")}`,
    "他のお客様の記憶・資料・文章は参照しないこと。機密情報は記憶対象外。",
    "関連性が低い記憶は無理に適用しないこと。",
  ].join("\n");
}

export function formatWorkMemoriesForPlanner(
  memories: readonly WorkMemoryRecord[],
): string | null {
  if (memories.length === 0) return null;

  const lines = memories.map((memory) => {
    const typeLabel = getWorkMemoryTypeLabel(memory.type);
    const confirmed = memory.isUserConfirmed ? " [確認済]" : "";
    const structured =
      Object.keys(memory.structuredData).length > 0
        ? ` (${JSON.stringify(memory.structuredData).slice(0, 120)})`
        : "";
    return `- [${typeLabel}] ${memory.title}: ${memory.summary}${structured}${confirmed}`;
  });

  const body = [buildWorkMemoryInjectionHeader(), ...lines].join("\n");
  if (body.length <= MAX_PLANNER_CHARS) return body;
  return `${body.slice(0, MAX_PLANNER_CHARS)}\n[...truncated]`;
}

export function readWorkMemoryFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): string | null {
  const raw = metadata?.workMemory;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export function buildWorkMemoryMetadata(
  memories: readonly WorkMemoryRecord[],
): Record<string, string> | null {
  const formatted = formatWorkMemoriesForPlanner(memories);
  if (!formatted) return null;
  return { workMemory: formatted };
}

export function summarizeWorkMemoriesForClient(
  memories: readonly WorkMemoryRecord[],
): WorkMemorySummary[] {
  return memories.map((memory) => ({
    id: memory.id,
    type: memory.type,
    title: memory.title,
    summary: memory.summary,
    isUserConfirmed: memory.isUserConfirmed,
  }));
}

export function shouldSkipWorkMemory(
  metadata?: Readonly<Record<string, unknown>>,
): boolean {
  return metadata?.skipWorkMemory === true;
}
