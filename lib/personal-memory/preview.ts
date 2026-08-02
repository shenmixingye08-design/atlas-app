/**
 * Memory Preview — what will be applied before generation.
 */

import { confidenceTier, confidenceTierLabel } from "@/lib/personal-memory/confidence";
import { SCOPE_LABELS } from "@/lib/personal-memory/labels";
import { resolveForContext } from "@/lib/personal-memory/service";
import type { PersonalMemoryRecord } from "@/lib/personal-memory/types";
import { listPersonalMemories } from "@/lib/personal-memory/service";

export type MemoryPreviewItem = {
  memoryId: string;
  label: string;
  summary: string;
  tier: "formal" | "candidate" | "suggestion";
  tierLabel: string;
  confidence: number;
  applied: boolean;
};

export type MemoryPreviewResult = {
  headline: string;
  items: MemoryPreviewItem[];
  injectionText: string;
  tokenEstimate: number;
  conflicts: Array<{ message: string; highRisk: boolean }>;
  instructionWins: boolean;
};

function valueLabel(memory: PersonalMemoryRecord): string {
  const text =
    typeof memory.value.text === "string"
      ? memory.value.text
      : typeof memory.value.palette === "string"
        ? memory.value.palette
        : memory.summary;
  return `${SCOPE_LABELS[memory.scope] ?? memory.scope}: ${text}`.slice(0, 80);
}

export async function buildMemoryPreview(input: {
  userId: string;
  notes?: string | null;
  currentInstruction?: Record<string, unknown> | null;
  artifactTypes?: string[];
  automationId?: string | null;
}): Promise<MemoryPreviewResult> {
  const { result } = await resolveForContext({
    userId: input.userId,
    notes: input.notes,
    currentInstruction: input.currentInstruction,
    artifactTypes: input.artifactTypes,
    automationId: input.automationId,
  });

  const all = (await listPersonalMemories(input.userId, { status: "all" })).filter(
    (memory) => memory.status !== "deleted",
  );
  const byId = new Map(all.map((m) => [m.id, m]));

  const appliedIds = new Set(result.used.map((u) => u.memoryId));
  const items: MemoryPreviewItem[] = [];

  for (const used of result.used) {
    const memory = byId.get(used.memoryId);
    const confidence = memory?.confidence ?? 0.9;
    const tier = confidenceTier(confidence);
    items.push({
      memoryId: used.memoryId,
      label: SCOPE_LABELS[used.scope] ?? used.scope,
      summary: used.summary,
      tier,
      tierLabel: confidenceTierLabel(tier),
      confidence,
      applied: true,
    });
  }

  // Surface candidates / suggestions that won't auto-apply
  for (const memory of all) {
    if (appliedIds.has(memory.id)) continue;
    if (memory.status !== "candidate" && memory.status !== "active") continue;
    const tier = confidenceTier(memory.confidence);
    if (tier === "formal" && memory.status === "active") continue;
    items.push({
      memoryId: memory.id,
      label: valueLabel(memory),
      summary: memory.summary,
      tier,
      tierLabel: confidenceTierLabel(tier),
      confidence: memory.confidence,
      applied: false,
    });
  }

  const appliedLabels = items
    .filter((item) => item.applied)
    .map((item) => item.summary || item.label)
    .slice(0, 8);

  return {
    headline:
      appliedLabels.length > 0
        ? `今回適用します: ${appliedLabels.join(" / ")}`
        : "今回適用する正式Memoryはありません（今回の指示のみで作成します）",
    items: items.slice(0, 24),
    injectionText: result.injectionText,
    tokenEstimate: result.tokenEstimate,
    conflicts: result.conflicts.map((c) => ({
      message: c.message,
      highRisk: c.highRisk,
    })),
    instructionWins: result.overrides.length > 0 || result.conflicts.some(
      (c) => c.kind === "instruction_vs_memory",
    ),
  };
}
