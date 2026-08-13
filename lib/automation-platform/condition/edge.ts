import type { ConditionEdgeDecision } from "./types";

/**
 * Detect false→true edges and new unmatched resources.
 * Never fire repeatedly while the same resources keep the condition true.
 */
export function decideConditionEdge(input: {
  previousState: boolean | null;
  currentState: boolean;
  matchedResourceIds: readonly string[];
  alreadyTriggeredResourceIds: readonly string[];
  openRunBlocks: boolean;
}): ConditionEdgeDecision {
  const previous = input.previousState;
  const current = input.currentState;

  if (input.openRunBlocks) {
    return {
      shouldTrigger: false,
      reason: "open_run_blocks",
      previousState: previous,
      currentState: current,
    };
  }

  if (!current) {
    return {
      shouldTrigger: false,
      reason: previous === true ? "true_to_false" : "still_false",
      previousState: previous,
      currentState: false,
    };
  }

  const triggered = new Set(
    input.alreadyTriggeredResourceIds.map((id) => id.trim()).filter(Boolean),
  );
  const fresh = input.matchedResourceIds
    .map((id) => id.trim())
    .filter((id) => id.length > 0 && !triggered.has(id));

  if (fresh.length === 0) {
    return {
      shouldTrigger: false,
      reason: "still_true_same_resources",
      previousState: previous,
      currentState: true,
    };
  }

  const resourceId = fresh[0]!;
  if (!resourceId) {
    return {
      shouldTrigger: false,
      reason: "missing_resource_id",
      previousState: previous,
      currentState: true,
    };
  }

  return {
    shouldTrigger: true,
    reason: previous === false || previous === null ? "false_to_true" : "new_resource_while_true",
    resourceId,
    previousState: previous,
    currentState: true,
  };
}
