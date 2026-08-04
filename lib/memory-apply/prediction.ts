/**
 * Prediction surface Memory apply.
 * Does NOT modify Proactive Suggestions core — provides a reusable hook
 * for prediction / next-action text that other layers can call.
 */

import "server-only";

import { MemoryApply } from "@/lib/memory-apply/apply";
import type { MemoryApplyOutput } from "@/lib/memory-apply/apply";

export type PredictionMemoryInput = {
  userId: string;
  /** Raw prediction / suggestion draft without Memory */
  draft: string;
  assignmentHint?: string | null;
  organizationId?: string | null;
  memoryEnabled?: boolean;
};

/**
 * Apply Personal/Work Memory to a prediction draft so suggestions
 * sound like the same secretary across surfaces.
 */
export async function applyMemoryForPrediction(
  input: PredictionMemoryInput,
): Promise<MemoryApplyOutput> {
  return MemoryApply({
    userId: input.userId,
    channel: "prediction",
    baseline: input.draft,
    assignment: input.assignmentHint ?? input.draft.slice(0, 200),
    organizationId: input.organizationId,
    memoryEnabled: input.memoryEnabled,
    artifactTypes: ["prediction"],
    capabilities: ["prediction"],
  });
}
