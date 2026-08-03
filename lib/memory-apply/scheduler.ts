import "server-only";

import { resolveForContext } from "@/lib/personal-memory/service";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

/**
 * Resolve timezone / notification method / priority from Personal Memory
 * for Scheduler defaults. Does not rewrite automation triggers silently when
 * an explicit timezone is already set.
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
    const { ledger } = await resolveForContext({
      userId: input.userId,
      allowedScopes: [
        "timezone",
        "notification_preferences",
        "automation_execution",
        "recurring_work_preferences",
      ],
      capabilities: ["schedule"],
    });

    let timezone: string | null = input.explicitTimezone?.trim() || null;
    let notifyMethod: string | null = null;
    let priority: string | null = null;

    for (const row of ledger.memoryValuesResolved) {
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

    const applied = ledger.memoryIdsUsed.length > 0;
    recordMemoryApplyEvent({
      userId: input.userId,
      channel: "scheduler",
      memoryMode: applied ? "on" : "off",
      applied,
      memoryIdsUsed: ledger.memoryIdsUsed,
      scopesUsed: [...new Set(ledger.memoryValuesResolved.map((v) => v.scope))],
      success: true,
    });

    return {
      timezone,
      notifyMethod,
      priority,
      memoryIdsUsed: ledger.memoryIdsUsed,
      applied,
    };
  } catch {
    recordMemoryApplyEvent({
      userId: input.userId,
      channel: "scheduler",
      memoryMode: "off",
      applied: false,
      success: false,
      failureReason: "resolve_failed",
    });
    return {
      timezone: input.explicitTimezone?.trim() || null,
      notifyMethod: null,
      priority: null,
      memoryIdsUsed: [],
      applied: false,
    };
  }
}
