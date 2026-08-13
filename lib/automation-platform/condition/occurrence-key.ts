/**
 * Stable occurrence keys for condition / event triggers.
 * Reuses atlas_automation_runs.schedule_occurrence_key unique index.
 */

export function buildConditionOccurrenceKey(input: {
  automationId: string;
  provider: string;
  eventType: string;
  resourceId: string;
  triggerVersion?: number;
}): string {
  const version = input.triggerVersion ?? 1;
  const provider = input.provider.trim().toLowerCase() || "unknown";
  const eventType = input.eventType.trim().toLowerCase() || "condition";
  const resourceId = input.resourceId.trim();
  if (!resourceId) {
    throw new Error("condition_occurrence_resource_id_required");
  }
  return `condition:${input.automationId}:v${version}:${provider}:${eventType}:${resourceId}`;
}

export function buildConditionRunKey(occurrenceKey: string): string {
  return occurrenceKey;
}
