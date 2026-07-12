import "server-only";

import {
  upsertSupabaseUserState,
  loadSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import {
  getDrTotalRetries,
  listDrBackups,
  listDrFallbacks,
  listDrQueueJobs,
  listDrRecoveryEvents,
  replaceDrState,
} from "./store";
import type {
  DrBackupSnapshot,
  DrFallbackState,
  DrQueueJob,
  DrRecoveryEvent,
} from "./types";

export const DR_GLOBAL_USER_ID = "__atlas_disaster_recovery__";
export const DR_DOMAIN_KEY = "atlasDisasterRecovery";

type DrDurablePayload = {
  version: 1;
  updatedAt: string;
  queue: DrQueueJob[];
  fallbacks: DrFallbackState[];
  backups: DrBackupSnapshot[];
  history: DrRecoveryEvent[];
  totalRetries: number;
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydrated = false;

function buildPayload(): DrDurablePayload {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    queue: listDrQueueJobs(),
    fallbacks: listDrFallbacks(),
    backups: listDrBackups(),
    history: listDrRecoveryEvents(),
    totalRetries: getDrTotalRetries(),
  };
}

export async function persistDisasterRecoveryNow(): Promise<void> {
  const payload = buildPayload();
  const ok = await upsertSupabaseUserState(DR_GLOBAL_USER_ID, DR_DOMAIN_KEY, {
    version: 1,
    updatedAt: payload.updatedAt,
    payload,
  });
  if (!ok) {
    console.warn(
      "[disaster-recovery] durable Supabase persist skipped or failed (not treated as saved).",
    );
  }
}

export function schedulePersistDisasterRecovery(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistDisasterRecoveryNow().catch((error) => {
      console.warn("[disaster-recovery] persist failed:", error);
    });
  }, 300);
}

export async function ensureDisasterRecoveryHydrated(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const loaded = await loadSupabaseUserState<{
    payload?: DrDurablePayload;
  }>(DR_GLOBAL_USER_ID, DR_DOMAIN_KEY);

  const root = loaded?.payload as
    | { payload?: DrDurablePayload }
    | DrDurablePayload
    | undefined;
  const payload =
    root && "payload" in root && root.payload && "queue" in root.payload
      ? root.payload
      : root && "queue" in (root as object)
        ? (root as DrDurablePayload)
        : null;

  if (payload) {
    replaceDrState({
      queue: payload.queue ?? [],
      fallbacks: payload.fallbacks ?? [],
      backups: payload.backups ?? [],
      history: payload.history ?? [],
      totalRetries: payload.totalRetries ?? 0,
    });
  }
}

export function resetDisasterRecoveryDurableForTests(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  hydrated = false;
}
