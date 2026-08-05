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
import {
  assertAutomationBackendReady,
  isAutomationDurableRequired,
  resolveAutomationStorageBackend,
} from "./automation-backend";
import {
  AutomationStoreUnavailableError,
  isAutomationSchemaMissingError,
  listDurableAutomationsForOwner,
  replaceDurableAutomationsForOwner,
} from "./durable-automation-definitions";

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
      destination: row.destination ?? "none",
      workflow: {
        assignment: row.workflow.assignment.slice(0, 800),
        metadata: row.workflow.metadata
          ? {
              destination:
                typeof row.workflow.metadata.destination === "string"
                  ? row.workflow.metadata.destination
                  : row.destination,
            }
          : row.destination
            ? { destination: row.destination }
            : undefined,
      },
      runHistory: (row.runHistory ?? []).slice(0, 8).map((entry) => ({
        ...entry,
        error: entry.error?.slice(0, 160) ?? null,
        generatedText: entry.generatedText?.slice(0, 280) ?? null,
        xPostId: entry.xPostId ?? null,
        xPostUrl: entry.xPostUrl ?? null,
        errorCode: entry.errorCode ?? null,
        scheduledAt: entry.scheduledAt ?? null,
        retryCount: entry.retryCount ?? 0,
      })),
      lastError: row.lastError?.slice(0, 200) ?? null,
    })),
  };
}

export function snapshotAutomations(userId: string): DurableAutomationsState {
  return {
    automations: listStoredAutomationsForUser(userId),
  };
}

/**
 * P0-6: Awaitable durable persist (definitions row SoT + optional blob mirror).
 * Production refuses success when durable write fails (no Map/memory fallback).
 */
export async function persistAutomationsNow(userId: string): Promise<void> {
  assertAutomationBackendReady();
  const backend = resolveAutomationStorageBackend();
  const snapshot = snapshotAutomations(userId);

  if (isAutomationDurableRequired()) {
    try {
      await replaceDurableAutomationsForOwner(userId, snapshot.automations);
    } catch (error) {
      if (error instanceof AutomationStoreUnavailableError) throw error;
      throw new AutomationStoreUnavailableError(
        `[automations] P0-6: durable persist failed — memory fallback disabled (${
          error instanceof Error ? error.message : "unknown"
        })`,
      );
    }
  }

  // Mirror blob for owner-index discovery / migration compatibility (supabase only).
  if (backend === "supabase") {
    const result = await persistDurableDomain(
      userId,
      AUTOMATIONS_DOMAIN_KEY,
      snapshot,
      { compact: compactAutomations, forceSupabase: true },
    );
    if (result === "skipped") {
      throw new AutomationStoreUnavailableError(
        "[automations] P0-6: atlas_user_state mirror persist skipped — memory fallback disabled",
      );
    }
  }

  if (snapshot.automations.length > 0) {
    await registerAutomationUserId(userId);
  } else {
    await unregisterAutomationUserIdIfEmpty(userId);
  }
}

/**
 * @deprecated P0-6: fire-and-forget is forbidden on Production mutation paths.
 * Use {@link persistAutomationsNow}. Kept for non-critical cleanup callers only.
 */
export function schedulePersistAutomations(userId: string): void {
  void persistAutomationsNow(userId).catch((error: unknown) => {
    console.error(
      `[automations] P0-6: background persist failed user=${userId}`,
      error,
    );
  });
}

export async function ensureAutomationsHydrated(userId: string): Promise<void> {
  if (isAutomationsHydrated(userId)) return;

  let schemaMissing = false;

  // P0-6: Prefer durable definition rows (survives Cold Start / process kill).
  if (isAutomationDurableRequired()) {
    try {
      const fromRows = await listDurableAutomationsForOwner(userId);
      if (fromRows.length > 0) {
        const normalized = fromRows.map((row) =>
          withAutomationDefaults({
            ...row,
            userId,
            runHistory: Array.isArray(row.runHistory)
              ? row.runHistory.slice(0, MAX_AUTOMATION_RUN_HISTORY)
              : [],
          }),
        );
        await serverAutomationRepository.replaceUserAutomations(
          userId,
          normalized,
        );
        markAutomationsHydrated(userId);
        await registerAutomationUserId(userId);
        return;
      }
    } catch (error) {
      // Schema not applied: fall through to atlas_user_state blob hydrate.
      // Empty owner (0 jobs) must render as empty home — not a permanent error.
      // Mutations still fail-closed until migration is applied.
      if (isAutomationSchemaMissingError(error)) {
        schemaMissing = true;
        console.error("[automations] P0-6: schema missing on hydrate — blob fallback", {
          userId,
          diagnosticId: error.diagnosticId,
          code: error.code,
        });
      } else {
        throw error;
      }
    }
  }

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
    // Write-through migrate blob → definition rows when durable required.
    // Skip when schema is missing — otherwise hydrate itself bricks home.
    if (isAutomationDurableRequired() && !schemaMissing) {
      try {
        await replaceDurableAutomationsForOwner(userId, normalized);
      } catch (error) {
        if (isAutomationSchemaMissingError(error)) {
          console.error(
            "[automations] P0-6: schema missing on blob migrate — kept memory hydrate",
            {
              userId,
              diagnosticId: error.diagnosticId,
              code: error.code,
            },
          );
          return;
        }
        throw error;
      }
    }
  }
}
