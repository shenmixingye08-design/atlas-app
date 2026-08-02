/**
 * Personal Memory metadata helpers for orchestration (planner injection).
 */

export function readPersonalMemoryFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): string | null {
  const raw = metadata?.personalMemory;
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  return null;
}

export function readPersonalMemoryTokenEstimate(
  metadata?: Readonly<Record<string, unknown>>,
): number | null {
  const raw = metadata?.personalMemoryTokenEstimate;
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

export function buildPersonalMemoryMetadata(input: {
  injectionText: string;
  tokenEstimate?: number;
  memoryIdsUsed?: string[];
}): Record<string, unknown> | null {
  if (!input.injectionText.trim()) return null;
  return {
    personalMemory: input.injectionText.trim(),
    ...(input.tokenEstimate != null
      ? { personalMemoryTokenEstimate: input.tokenEstimate }
      : {}),
    ...(input.memoryIdsUsed && input.memoryIdsUsed.length > 0
      ? { personalMemoryIdsUsed: input.memoryIdsUsed }
      : {}),
  };
}
