import { buildMemoryInjectionHeader } from "@/lib/atlas-personality";

const MAX_PLANNER_CHARS = 1_200;

export function readPersonalMemoryFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): string | null {
  const raw = metadata?.personalMemory;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export function formatPersonalMemoryForPlanner(injectionText: string): string {
  const body = [buildMemoryInjectionHeader(), injectionText].join("\n");
  if (body.length <= MAX_PLANNER_CHARS) return body;
  return `${body.slice(0, MAX_PLANNER_CHARS)}\n[...truncated]`;
}
