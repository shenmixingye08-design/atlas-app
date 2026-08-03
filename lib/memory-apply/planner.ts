/**
 * Planner surface Memory apply — orchestration planner knowledge.
 * Does NOT rewrite Planner core; only prepares injection metadata.
 * Path: MemoryApply → PersonalizationContext → PromptBuilder.
 */

import "server-only";

import { MemoryApply } from "@/lib/memory-apply/apply";
import type { MemoryApplyOutput } from "@/lib/memory-apply/apply";
import { buildPersonalMemoryMetadata } from "@/lib/memory-apply/orchestration-metadata";

export type PlannerMemoryInput = {
  userId: string;
  assignment: string;
  organizationId?: string | null;
  automationId?: string | null;
  deliverableType?: string | null;
  memoryEnabled?: boolean;
};

export type PlannerMemoryApplyResult = MemoryApplyOutput & {
  /** Metadata fragment for orchestrate({ metadata }) */
  metadata: Record<string, unknown> | null;
};

/**
 * Build planner PersonalizationContext and orchestration metadata.
 */
export async function applyMemoryForPlanner(
  input: PlannerMemoryInput,
): Promise<PlannerMemoryApplyResult> {
  const applied = await MemoryApply({
    userId: input.userId,
    channel: "planner",
    baseline: input.assignment,
    assignment: input.assignment,
    organizationId: input.organizationId,
    automationId: input.automationId,
    memoryEnabled: input.memoryEnabled,
    artifactTypes: input.deliverableType ? [input.deliverableType] : ["document"],
    capabilities: ["planner", "orchestration"],
  });

  const injection =
    applied.prompt.injection.fullText || applied.context.injectionText;
  const metadata = buildPersonalMemoryMetadata({
    injectionText: injection,
    tokenEstimate: applied.context.tokenEstimate,
    memoryIdsUsed: applied.context.memoryIdsUsed,
  });

  return {
    ...applied,
    metadata: metadata
      ? {
          ...metadata,
          personalMemoryScopesUsed: applied.context.scopesUsed,
          memoryApplyChannel: "planner",
        }
      : null,
  };
}
