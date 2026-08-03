import "server-only";

import {
  assertMemoryLoadedForAi,
  loadMemory,
} from "@/lib/memory-apply/pipeline";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Resolve timezone / notification method / priority from Personal Memory
 * for Scheduler defaults via the unified loadMemory path (Fail Closed).
 */
export async function resolveSchedulerMemoryDefaults(input: {
  userId: string;
  explicitTimezone?: string | null;
}): Promise<{
  timezone: string | null;
  notifyMethod: string | null;
  priority: string | null;
  memoryIdsUsed: string[];
  applied: boolean;
}> {
  const applied = await loadMemory({
    userId: input.userId,
    channel: "scheduler",
    baseline: "scheduler defaults",
    capabilities: ["schedule"],
  });
  assertMemoryLoadedForAi(applied.context);

  let timezone: string | null = input.explicitTimezone?.trim() || null;
  let notifyMethod: string | null = null;
  let priority: string | null = null;

  for (const row of applied.provider.personalValues) {
    if (!timezone) {
      timezone =
        asString(row.value.timezone) ??
        asString(row.value.tz) ??
        (row.scope === "timezone" ? asString(row.value.text) : null) ??
        (row.scope === "timezone" ? row.summary : null);
    }
    notifyMethod =
      notifyMethod ??
      asString(row.value.notifyMethod) ??
      asString(row.value.channel);
    priority =
      priority ?? asString(row.value.priority) ?? asString(row.value.urgency);
  }

  return {
    timezone,
    notifyMethod,
    priority,
    memoryIdsUsed: applied.context.memoryIdsUsed,
    applied: applied.context.memoryIdsUsed.length > 0,
  };
}
