import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";

/**
 * Attach stepId / dedupeKey and skip duplicates.
 * Never drops existing artifacts (途中成果物を消さない).
 */
export function mergeStepArtifacts(input: {
  existing: readonly AutomationRunArtifact[];
  incoming: readonly AutomationRunArtifact[];
  stepId: string;
}): AutomationRunArtifact[] {
  const out = [...input.existing];
  const seenKeys = new Set(
    out
      .map((a) => a.dedupeKey)
      .filter((k): k is string => typeof k === "string" && k.length > 0),
  );
  const seenExternal = new Set(
    out
      .map((a) => a.externalId)
      .filter((k): k is string => typeof k === "string" && k.length > 0),
  );

  for (const artifact of input.incoming) {
    const withStep: AutomationRunArtifact = {
      ...artifact,
      stepId: artifact.stepId ?? input.stepId,
      dedupeKey:
        artifact.dedupeKey ??
        (artifact.externalId
          ? `${input.stepId}:${artifact.kind}:${artifact.externalId}`
          : `${input.stepId}:${artifact.kind}:${artifact.label}`),
    };

    if (withStep.dedupeKey && seenKeys.has(withStep.dedupeKey)) {
      continue;
    }
    if (withStep.externalId && seenExternal.has(withStep.externalId)) {
      continue;
    }

    if (withStep.dedupeKey) seenKeys.add(withStep.dedupeKey);
    if (withStep.externalId) seenExternal.add(withStep.externalId);
    out.push(withStep);
  }

  return out;
}
