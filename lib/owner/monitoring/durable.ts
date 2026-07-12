import "server-only";

import {
  loadSupabaseUserState,
  upsertSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import {
  getCronTickState,
  listMonitoringIncidents,
  replaceMonitoringState,
} from "./store";
import type { MonitoringIncident } from "./types";

export const MONITORING_GLOBAL_USER_ID = "__atlas_monitoring__";
export const MONITORING_DOMAIN_KEY = "atlasMonitoring";

type MonitoringDurablePayload = {
  version: 1;
  updatedAt: string;
  incidents: MonitoringIncident[];
  cron: {
    lastSuccessAt: string | null;
    lastFailureAt: string | null;
    lastError: string | null;
  };
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let hydrated = false;

function buildPayload(): MonitoringDurablePayload {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    incidents: listMonitoringIncidents(),
    cron: getCronTickState(),
  };
}

export async function persistMonitoringNow(): Promise<boolean> {
  const payload = buildPayload();
  return upsertSupabaseUserState(MONITORING_GLOBAL_USER_ID, MONITORING_DOMAIN_KEY, {
    version: 1,
    updatedAt: payload.updatedAt,
    payload,
  });
}

export function schedulePersistMonitoring(): void {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    void persistMonitoringNow().then((ok) => {
      if (!ok) {
        console.warn(
          "[monitoring] durable Supabase persist skipped or failed (not treated as saved).",
        );
      }
    });
  }, 300);
}

export async function ensureMonitoringHydrated(): Promise<void> {
  if (hydrated) return;
  hydrated = true;

  const loaded = await loadSupabaseUserState<{
    payload?: MonitoringDurablePayload;
  }>(MONITORING_GLOBAL_USER_ID, MONITORING_DOMAIN_KEY);

  const root = loaded?.payload as
    | { payload?: MonitoringDurablePayload }
    | MonitoringDurablePayload
    | undefined;
  const payload =
    root && "payload" in root && root.payload && "incidents" in root.payload
      ? root.payload
      : root && "incidents" in (root as object)
        ? (root as MonitoringDurablePayload)
        : null;

  if (payload) {
    replaceMonitoringState({
      incidents: payload.incidents ?? [],
      cron: payload.cron ?? {
        lastSuccessAt: null,
        lastFailureAt: null,
        lastError: null,
      },
    });
  }
}

export function resetMonitoringDurableForTests(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  hydrated = false;
}
