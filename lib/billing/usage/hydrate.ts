import {
  buildDurableReadDiagnosticId,
  logDurableReadFailure,
} from "@/lib/persistence/durable-read-log";
import { isAtlasProduction } from "@/lib/runtime/is-production";

import { countBillableAutomations } from "./automation-inventory";
import { loadDurableUsageCounters } from "./durable-counters";
import { getUsageMonthKey } from "./period";
import { reconcileCurrentMonthUsageFromEvidence } from "./reconcile";
import { setAutomationTaskCount } from "./store";

export type UsageHydrateResult = {
  ready: boolean;
  error: string | null;
};

const inflight = new Map<string, Promise<UsageHydrateResult>>();

function hydrateKey(userId: string, month: string): string {
  return `${userId}:${month}`;
}

export function resetUsageHydrateInflightForTests(): void {
  inflight.clear();
}

/**
 * Load durable AI / X / WordPress counters + live automation inventory.
 * Failure must not be presented as used=0.
 */
export function hydrateUserUsageMeters(
  userId: string,
): Promise<UsageHydrateResult> {
  if (!userId.trim()) {
    return Promise.resolve({ ready: false, error: "user_required" });
  }
  const month = getUsageMonthKey();
  const key = hydrateKey(userId, month);
  const existing = inflight.get(key);
  if (existing) return existing;

  const pending = runHydrate(userId, month).finally(() => {
    if (inflight.get(key) === pending) inflight.delete(key);
  });
  inflight.set(key, pending);
  return pending;
}

async function runHydrate(
  userId: string,
  month: string,
): Promise<UsageHydrateResult> {
  let usageReady = !isAtlasProduction();
  let usageError: string | null = null;
  try {
    const loaded = await loadDurableUsageCounters(userId, month);
    usageReady = loaded.ready;
    if (!loaded.ready) {
      usageError = loaded.error ?? "usage_unavailable";
    } else {
      const reconciled = await reconcileCurrentMonthUsageFromEvidence(
        userId,
        month,
      );
      if (!reconciled.ready && isAtlasProduction()) {
        usageReady = false;
        usageError = "usage_unavailable";
      } else {
        const refreshed = await loadDurableUsageCounters(userId, month);
        usageReady = refreshed.ready;
        if (!refreshed.ready) {
          usageError = refreshed.error ?? "usage_unavailable";
        }
      }
    }
  } catch (error) {
    usageReady = false;
    usageError = error instanceof Error ? error.message : "usage_unavailable";
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

  if (!usageReady || !automationReady) {
    const error = usageError ?? automationError ?? "usage_unavailable";
    logDurableReadFailure({
      endpoint: "/api/billing/summary",
      userId,
      code: error,
      databaseCode: null,
      table: !usageReady
        ? "atlas_billing_usage_counters"
        : "atlas_automation_definitions",
      diagnosticId: buildDurableReadDiagnosticId("usage_hydrate"),
      message: !usageReady
        ? usageError ?? "usage_unavailable"
        : automationError ?? "automation_usage_unavailable",
    });
    return {
      ready: false,
      error,
    };
  }
  return { ready: true, error: null };
}
