import "server-only";

import {
  loadDurableDomain,
  persistDurableDomain,
} from "@/lib/persistence/durable-domain";

import { findCompanyTemplate } from "./registry";
import {
  clearServerActiveCompanyStateForUser,
  getServerActiveCompanyStateForUser,
  hasServerActiveCompanyStateForUser,
  setServerActiveCompanyStateForUser,
} from "./store";
import type { ActiveCompanyState, CompanyTemplateId } from "./types";
import { DEFAULT_COMPANY_TEMPLATE_ID } from "./types";

/** Postgres atlas_user_state domain — P3-02 tenant SoT. */
export const ACTIVE_COMPANY_DOMAIN_KEY = "atlasActiveCompany";

export type DurableActiveCompanyState = {
  templateId: CompanyTemplateId;
  selectedAt: string;
};

type HydrationFlags = Set<string>;

function getHydrated(): HydrationFlags {
  const globalScope = globalThis as typeof globalThis & {
    __atlasActiveCompanyHydrated?: HydrationFlags;
  };
  if (!globalScope.__atlasActiveCompanyHydrated) {
    globalScope.__atlasActiveCompanyHydrated = new Set();
  }
  return globalScope.__atlasActiveCompanyHydrated;
}

export function resetActiveCompanyDurableForTests(): void {
  getHydrated().clear();
}

function compact(
  state: DurableActiveCompanyState,
): DurableActiveCompanyState {
  return {
    templateId: state.templateId,
    selectedAt: state.selectedAt,
  };
}

function normalizeState(
  raw: DurableActiveCompanyState | ActiveCompanyState | null | undefined,
): ActiveCompanyState | null {
  if (!raw || typeof raw !== "object") return null;
  const templateId =
    typeof raw.templateId === "string" ? raw.templateId.trim() : "";
  if (!templateId || !findCompanyTemplate(templateId)) return null;
  const selectedAt =
    typeof raw.selectedAt === "string" && raw.selectedAt.trim()
      ? raw.selectedAt
      : new Date(0).toISOString();
  return {
    templateId: templateId as CompanyTemplateId,
    selectedAt,
  };
}

export function snapshotActiveCompany(userId: string): DurableActiveCompanyState {
  const state = getServerActiveCompanyStateForUser(userId);
  return compact({
    templateId: state.templateId,
    selectedAt: state.selectedAt,
  });
}

/** Fire-and-forget persist (Map remains cache only). */
export function schedulePersistActiveCompany(userId: string): void {
  if (!userId.trim()) return;
  void persistActiveCompanyNow(userId);
}

export async function persistActiveCompanyNow(
  userId: string,
): Promise<"supabase" | "clerk" | "clerk_compact" | "skipped"> {
  if (!userId.trim()) return "skipped";
  return persistDurableDomain(
    userId,
    ACTIVE_COMPANY_DOMAIN_KEY,
    snapshotActiveCompany(userId),
    { compact, forceSupabase: true },
  );
}

/**
 * Load durable SoT into process cache once per user per instance.
 * Does not invent durable defaults — missing rows leave cache empty (default on read).
 */
export async function ensureActiveCompanyHydrated(
  userId: string,
): Promise<void> {
  if (!userId.trim()) return;
  const hydrated = getHydrated();
  if (hydrated.has(userId)) return;
  hydrated.add(userId);

  if (hasServerActiveCompanyStateForUser(userId)) return;

  const loaded = await loadDurableDomain<DurableActiveCompanyState>(
    userId,
    ACTIVE_COMPANY_DOMAIN_KEY,
  );
  const normalized = normalizeState(loaded);
  if (!normalized) return;
  setServerActiveCompanyStateForUser(userId, normalized);
}

/** Probe/test helper: drop cache so next hydrate must hit Postgres. */
export function evictActiveCompanyCacheForUser(userId: string): void {
  clearServerActiveCompanyStateForUser(userId);
  getHydrated().delete(userId);
}

/**
 * Server-authoritative template id for a user (after hydrate).
 * Client metadata may suggest an id only when it matches a known template AND
 * equals the server SoT — otherwise server wins (P3-02).
 */
export function resolveAuthoritativeTemplateId(input: {
  userId: string;
  metadataTemplateId?: string | null;
}): CompanyTemplateId {
  const serverId = getServerActiveCompanyStateForUser(input.userId).templateId;
  const meta =
    typeof input.metadataTemplateId === "string"
      ? input.metadataTemplateId.trim()
      : "";
  if (!meta) return serverId;
  if (!findCompanyTemplate(meta)) return serverId;
  // Allow metadata only as echo of server SoT (never spoof to another template).
  if (meta === serverId) return serverId;
  return serverId;
}

export function defaultActiveCompanyState(): ActiveCompanyState {
  return {
    templateId: DEFAULT_COMPANY_TEMPLATE_ID,
    selectedAt: new Date(0).toISOString(),
  };
}
