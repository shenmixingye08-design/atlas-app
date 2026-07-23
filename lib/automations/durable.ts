import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import type { Automation } from "./types";
import {
  isAutomationsHydrated,
  listStoredAutomationsForUser,
  markAutomationsHydrated,
  serverAutomationRepository,
  withAutomationDefaults,
  MAX_AUTOMATION_RUN_HISTORY,
} from "./repositories/server-automation-repository";
import {
  registerAutomationUserId,
  unregisterAutomationUserIdIfEmpty,
  AUTOMATIONS_DOMAIN_KEY,
} from "./global-durable";

export { AUTOMATIONS_DOMAIN_KEY };

export type DurableAutomationsState = {
  automations: Automation[];
};

const MAX_CLERK_AUTOMATIONS = 40;

function compactAutomations(
  state: DurableAutomationsState,
): DurableAutomationsState {
  return {
    automations: state.automations.slice(0, MAX_CLERK_AUTOMATIONS).map((row) => ({
      ...withAutomationDefaults(row),
      description: row.description.slice(0, 240),
      workflow: {
        assignment: row.workflow.assignment.slice(0, 800),
        metadata: undefined,
      },
      runHistory: (row.runHistory ?? []).slice(0, 8).map((entry) => ({
        ...entry,
        error: entry.error?.slice(0, 160) ?? null,
        deliverablePreview: entry.deliverablePreview?.slice(0, 160) ?? null,
        generatedContent: entry.generatedContent?.slice(0, 400) ?? null,
        actions: (entry.actions ?? []).slice(0, 8),
        apisUsed: (entry.apisUsed ?? []).slice(0, 8),
        stoppedAtStage: entry.stoppedAtStage ?? null,
        artifacts: entry.artifacts
          ? {
              tweetUrl: entry.artifacts.tweetUrl?.slice(0, 200) ?? null,
              tweetId: entry.artifacts.tweetId?.slice(0, 64) ?? null,
              deliverableCount: entry.artifacts.deliverableCount,
              preview: entry.artifacts.preview?.slice(0, 160) ?? null,
            }
          : null,
      })),
      lastError: row.lastError?.slice(0, 200) ?? null,
      lastResultSummary: row.lastResultSummary?.slice(0, 240) ?? null,
    })),
  };
}

export function snapshotAutomations(userId: string): DurableAutomationsState {
  return {
    automations: listStoredAutomationsForUser(userId),
  };
}

export function schedulePersistAutomations(userId: string): void {
  void persistAutomationsNow(userId);
}

/**
 * Awaitable durable write. Serverless can freeze when a route returns, so
 * mutations must await this before responding so schedules survive restarts.
 */
export async function persistAutomationsNow(userId: string): Promise<void> {
  await persistDurableDomain(
    userId,
    AUTOMATIONS_DOMAIN_KEY,
    snapshotAutomations(userId),
    { compact: compactAutomations },
  );
  const rows = listStoredAutomationsForUser(userId);
  if (rows.length > 0) {
    await registerAutomationUserId(userId);
  } else {
    await unregisterAutomationUserIdIfEmpty(userId);
  }
}

export async function ensureAutomationsHydrated(userId: string): Promise<void> {
  if (isAutomationsHydrated(userId)) return;
  markAutomationsHydrated(userId);

  if (listStoredAutomationsForUser(userId).length > 0) return;

  const loaded = await loadDurableDomain<DurableAutomationsState>(
    userId,
    AUTOMATIONS_DOMAIN_KEY,
  );
  if (!loaded?.automations || !Array.isArray(loaded.automations)) return;

  const normalized = loaded.automations
    .filter((row) => row && typeof row.id === "string")
    .map((row) =>
      withAutomationDefaults({
        ...row,
        userId,
        runHistory: Array.isArray(row.runHistory)
          ? row.runHistory.slice(0, MAX_AUTOMATION_RUN_HISTORY)
          : [],
      }),
    );

  await serverAutomationRepository.replaceUserAutomations(userId, normalized);
  if (normalized.length > 0) {
    await registerAutomationUserId(userId);
  }
}
