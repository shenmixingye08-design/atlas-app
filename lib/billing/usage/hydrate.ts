import {
  buildDurableReadDiagnosticId,
  logDurableReadFailure,
} from "@/lib/persistence/durable-read-log";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import { countBillableAutomations } from "./automation-inventory";
import { loadDurableAiRuns } from "./quota-engine";
import { getUsageSnapshot, saveUsageSnapshot, setAutomationTaskCount } from "./store";

export type UsageHydrateResult = {
  ready: boolean;
  error: string | null;
};

/**
 * Load durable AI runs + live automation inventory into the process cache.
 * Failure must not be presented as used=0.
 */
export async function hydrateUserUsageMeters(
  userId: string,
): Promise<UsageHydrateResult> {
  if (!userId.trim()) {
    return { ready: false, error: "user_required" };
  }

  let aiReady = !isAtlasProduction();
  let aiError: string | null = null;
  try {
    const ai = await loadDurableAiRuns(userId);
    aiReady = ai.ready;
    if (ai.ready) {
      const current = getUsageSnapshot(userId);
      saveUsageSnapshot({
        ...current,
        aiRuns: ai.used,
        updatedAt: new Date().toISOString(),
      });
    } else {
      aiError = "ai_usage_unavailable";
    }
  } catch (error) {
    aiReady = false;
    aiError = error instanceof Error ? error.message : "ai_usage_unavailable";
  }

  let automationReady = true;
  let automationError: string | null = null;
  try {
    const used = await countBillableAutomations(userId);
    setAutomationTaskCount(userId, used);
  } catch (error) {
    automationReady = false;
    automationError =
      error instanceof Error ? error.message : "automation_usage_unavailable";
  }

  if (!aiReady || !automationReady) {
    const error = aiError ?? automationError ?? "usage_unavailable";
    logDurableReadFailure({
      endpoint: "/api/billing/summary",
      userId,
      code: error,
      databaseCode: null,
      table: !aiReady
        ? "atlas_billing_usage_counters"
        : "atlas_automation_definitions",
      diagnosticId: buildDurableReadDiagnosticId("usage_hydrate"),
      message: !aiReady
        ? aiError ?? "ai_usage_unavailable"
        : automationError ?? "automation_usage_unavailable",
    });
    return {
      ready: false,
      error,
    };
  }
  return { ready: true, error: null };
}
