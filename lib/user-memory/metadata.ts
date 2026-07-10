import { buildMemoryInjectionHeader } from "@/lib/atlas-personality";
import type { UserMemory } from "./types";
import { getMemoryCategoryLabel } from "./labels";

const MAX_PLANNER_CHARS = 1_200;

export function formatMemoriesForPlanner(
  memories: readonly UserMemory[],
): string | null {
  if (memories.length === 0) return null;

  const lines = memories.map((memory) => {
    const category = getMemoryCategoryLabel(memory.category);
    const pin = memory.pinned ? " [固定]" : "";
    return `- [${category}] ${memory.title}: ${memory.content}${pin}`;
  });

  const body = [
    buildMemoryInjectionHeader(),
    ...lines,
  ].join("\n");

  if (body.length <= MAX_PLANNER_CHARS) return body;
  return `${body.slice(0, MAX_PLANNER_CHARS)}\n[...truncated]`;
}

export function readAtlasMemoryFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): string | null {
  const raw = metadata?.atlasMemory;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export function buildAtlasMemoryMetadata(
  memories: readonly UserMemory[],
): Record<string, string> | null {
  const formatted = formatMemoriesForPlanner(memories);
  if (!formatted) return null;
  return { atlasMemory: formatted };
}
