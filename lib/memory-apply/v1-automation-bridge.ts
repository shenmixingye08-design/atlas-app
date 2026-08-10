/**
 * N-05: Wire Personal Memory into Automation v1 (lib/automations) runs.
 * v2 already uses applyMemoryForAutomation; v1 previously called orchestrate
 * without personalMemory metadata — closing that gap without rewriting cores.
 */

import "server-only";

import { MemoryApply } from "@/lib/memory-apply/apply";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";
import { ensurePersonalMemoryHydrated } from "@/lib/personal-memory/durable";

export type V1AutomationMemoryMetadata = {
  personalMemory?: string;
  personalMemoryIdsUsed?: string[];
  personalMemoryScopesUsed?: string[];
  personalMemoryTokenEstimate?: number;
  memoryRetrieved?: boolean;
  memoryApplied?: boolean;
  memorySource?: "atlasPersonalMemory" | "none";
  appliedPreferenceKeys?: string[];
  correlationId?: string;
};

/**
 * Resolve Personal Memory for a v1 automation assignment and return
 * orchestration metadata fields (safe: never throws into the run).
 */
export async function buildV1AutomationMemoryMetadata(input: {
  userId: string;
  assignment: string;
  automationId: string;
}): Promise<V1AutomationMemoryMetadata> {
  if (!input.userId.trim()) {
    return {
      memoryRetrieved: false,
      memoryApplied: false,
      memorySource: "none",
      appliedPreferenceKeys: [],
    };
  }

  try {
    await ensurePersonalMemoryHydrated(input.userId);
    const applied = await MemoryApply({
      userId: input.userId,
      channel: "automation",
      baseline: input.assignment,
      assignment: input.assignment,
      automationId: input.automationId,
      artifactTypes: ["sns", "document"],
      capabilities: ["automation", "workflow"],
    });
    const memoryRetrieved = applied.context.memoryIdsUsed.length > 0;
    const preferenceKeys = applied.context.content?.preferenceKeys ?? [];
    const injection = applied.prompt.injection.fullText ?? "";
    const memoryApplied = memoryRetrieved && injection.trim().length > 0;
    const correlationId = `corr_v1_${input.automationId.slice(0, 12)}`;

    recordMemoryApplyEvent({
      userId: input.userId,
      channel: "workflow",
      memoryMode: applied.context.mode,
      applied: memoryApplied,
      memoryRetrieved,
      memoryApplied,
      memorySource: memoryRetrieved ? "atlasPersonalMemory" : "none",
      appliedPreferenceKeys: preferenceKeys,
      memoryIdsUsed: applied.context.memoryIdsUsed,
      scopesUsed: applied.context.scopesUsed,
      improvementRate: applied.quality.improvementRate,
      success: true,
      correlationId,
    });

    if (!injection.trim()) {
      return {
        memoryRetrieved,
        memoryApplied: false,
        memorySource: memoryRetrieved ? "atlasPersonalMemory" : "none",
        appliedPreferenceKeys: preferenceKeys,
        correlationId,
        personalMemoryIdsUsed: applied.context.memoryIdsUsed,
        personalMemoryScopesUsed: applied.context.scopesUsed,
      };
    }

    return {
      personalMemory: injection.slice(0, 1200),
      personalMemoryIdsUsed: applied.context.memoryIdsUsed,
      personalMemoryScopesUsed: applied.context.scopesUsed,
      personalMemoryTokenEstimate: applied.context.tokenEstimate,
      memoryRetrieved,
      memoryApplied,
      memorySource: "atlasPersonalMemory",
      appliedPreferenceKeys: preferenceKeys,
      correlationId,
    };
  } catch {
    // Fail-closed: Memory unavailable → run without Memory (never cross-user).
    return {
      memoryRetrieved: false,
      memoryApplied: false,
      memorySource: "none",
      appliedPreferenceKeys: [],
    };
  }
}
