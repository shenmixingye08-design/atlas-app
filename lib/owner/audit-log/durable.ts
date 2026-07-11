import "server-only";

import {
  upsertSupabaseUserState,
  loadSupabaseUserState,
} from "@/lib/persistence/supabase-user-state";

import {
  getAuditLogSettings,
  isAuditLogHydrated,
  listAuditLogEntries,
  markAuditLogHydrated,
  replaceAuditLogEntries,
  setAuditLogSettings,
} from "./store";
import type { AuditLogEntry, AuditLogSettings } from "./types";

/** Synthetic owner-scoped row in Supabase atlas_user_state (reuse existing persistence). */
export const AUDIT_LOG_GLOBAL_USER_ID = "__atlas_audit_log__";
export const AUDIT_LOG_DOMAIN_KEY = "atlasAuditLog";

export type AuditDurablePayload = {
  version: 1;
  updatedAt: string;
  settings: AuditLogSettings;
  entries: AuditLogEntry[];
};

let persistTimer: ReturnType<typeof setTimeout> | null = null;
let pendingPersist = false;

function buildPayload(): AuditDurablePayload {
  return {
    version: 1,
    updatedAt: new Date().toISOString(),
    settings: getAuditLogSettings(),
    entries: listAuditLogEntries(),
  };
}

function unwrapPayload(loaded: unknown): AuditDurablePayload | null {
  if (!loaded || typeof loaded !== "object") return null;
  const root = loaded as { payload?: unknown };
  const candidate = root.payload ?? loaded;
  if (!candidate || typeof candidate !== "object") return null;
  const asPayload = candidate as Partial<AuditDurablePayload>;
  if (Array.isArray(asPayload.entries)) {
    return {
      version: 1,
      updatedAt:
        typeof asPayload.updatedAt === "string"
          ? asPayload.updatedAt
          : new Date().toISOString(),
      settings: asPayload.settings ?? {
        retentionDays: 90,
        updatedAt: null,
      },
      entries: asPayload.entries,
    };
  }

  // Nested envelope: { payload: AuditDurablePayload }
  if (
    asPayload &&
    "payload" in asPayload &&
    asPayload.payload &&
    typeof asPayload.payload === "object"
  ) {
    return unwrapPayload(asPayload.payload);
  }

  return null;
}

async function writeDurable(payload: AuditDurablePayload): Promise<void> {
  await upsertSupabaseUserState(AUDIT_LOG_GLOBAL_USER_ID, AUDIT_LOG_DOMAIN_KEY, {
    version: 1,
    updatedAt: payload.updatedAt,
    payload,
  });
}

export async function persistAuditLogNow(): Promise<void> {
  pendingPersist = false;
  await writeDurable(buildPayload());
}

export function schedulePersistAuditLog(): void {
  pendingPersist = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!pendingPersist) return;
    void persistAuditLogNow().catch((error) => {
      console.warn("[audit-log] durable persist failed:", error);
    });
  }, 250);
}

export async function ensureAuditLogHydrated(): Promise<void> {
  if (isAuditLogHydrated()) return;

  const loaded = await loadSupabaseUserState<unknown>(
    AUDIT_LOG_GLOBAL_USER_ID,
    AUDIT_LOG_DOMAIN_KEY,
  );

  const payload = unwrapPayload(loaded);
  if (payload) {
    replaceAuditLogEntries(payload.entries);
    if (payload.settings?.retentionDays) {
      setAuditLogSettings(
        payload.settings.retentionDays,
        payload.settings.updatedAt ?? undefined,
      );
    }
  } else {
    markAuditLogHydrated();
  }
}

export function resetAuditLogDurableForTests(): void {
  if (persistTimer) {
    clearTimeout(persistTimer);
    persistTimer = null;
  }
  pendingPersist = false;
}
