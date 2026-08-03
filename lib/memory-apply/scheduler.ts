import "server-only";

import { MemoryApply } from "@/lib/memory-apply/apply";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Resolve timezone / notification method / priority from Personal Memory
 * for Scheduler defaults via the unified MemoryApply path.
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
  try {
    const applied = await MemoryApply({
      userId: input.userId,
      channel: "scheduler",
      baseline: "scheduler defaults",
      capabilities: ["schedule"],
    });

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
  } catch {
    return {
      timezone: input.explicitTimezone?.trim() || null,
      notifyMethod: null,
      priority: null,
      memoryIdsUsed: [],
      applied: false,
    };
  }
}
