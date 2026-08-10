import type {
  ActiveCompanyState,
  CompanyTemplateId,
} from "./types";
import {
  ACTIVE_COMPANY_STORAGE_KEY,
  DEFAULT_COMPANY_TEMPLATE_ID,
} from "./types";

function createDefaultState(): ActiveCompanyState {
  return {
    templateId: DEFAULT_COMPANY_TEMPLATE_ID,
    selectedAt: new Date().toISOString(),
  };
}

type CompanyStateBucket = Map<string, ActiveCompanyState>;

function getServerUserBucket(): CompanyStateBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasActiveCompanyByUser?: CompanyStateBucket;
    /** @deprecated legacy global slot — ignored for reads after P0-03 */
    __atlasActiveCompany?: ActiveCompanyState;
  };

  if (!globalScope.__atlasActiveCompanyByUser) {
    globalScope.__atlasActiveCompanyByUser = new Map();
  }

  return globalScope.__atlasActiveCompanyByUser;
}

/** True when this instance has a cached (possibly hydrated) selection. */
export function hasServerActiveCompanyStateForUser(userId: string): boolean {
  if (!userId) return false;
  return getServerUserBucket().has(userId);
}

/**
 * Read active template for a user.
 * P3-02: Map is cache only — miss returns default WITHOUT seeding the Map
 * (so hydrate can load Postgres SoT).
 */
export function getServerActiveCompanyStateForUser(
  userId: string,
): ActiveCompanyState {
  if (!userId) return createDefaultState();
  const existing = getServerUserBucket().get(userId);
  if (existing) return existing;
  return createDefaultState();
}

export function setServerActiveCompanyStateForUser(
  userId: string,
  state: ActiveCompanyState,
): ActiveCompanyState {
  if (!userId) return state;
  getServerUserBucket().set(userId, state);
  return state;
}

export function clearServerActiveCompanyStateForUser(userId: string): void {
  if (!userId) return;
  getServerUserBucket().delete(userId);
}

/**
 * @deprecated Global active company is no longer authoritative (P0-03).
 * Prefer getServerActiveCompanyStateForUser.
 */
export function getServerActiveCompanyState(): ActiveCompanyState {
  return createDefaultState();
}

/**
 * @deprecated Prefer setServerActiveCompanyStateForUser.
 */
export function setServerActiveCompanyState(
  state: ActiveCompanyState,
): ActiveCompanyState {
  return state;
}

/**
 * Browser UI cache only (P3-02: not SoT).
 * Optionally scoped by userId when provided to reduce account-switch bleed.
 */
export function getClientActiveCompanyState(
  userId?: string | null,
): ActiveCompanyState {
  if (typeof window === "undefined") {
    return createDefaultState();
  }

  try {
    const key = clientStorageKey(userId);
    const raw = localStorage.getItem(key);
    if (!raw) {
      // Legacy unscoped key migration (read-only fallback).
      if (userId) {
        const legacy = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
        if (legacy) return JSON.parse(legacy) as ActiveCompanyState;
      }
      return createDefaultState();
    }
    return JSON.parse(raw) as ActiveCompanyState;
  } catch {
    return createDefaultState();
  }
}

export function setClientActiveCompanyState(
  state: ActiveCompanyState,
  userId?: string | null,
): ActiveCompanyState {
  if (typeof window !== "undefined") {
    localStorage.setItem(clientStorageKey(userId), JSON.stringify(state));
  }
  return state;
}

function clientStorageKey(userId?: string | null): string {
  const id = userId?.trim();
  return id
    ? `${ACTIVE_COMPANY_STORAGE_KEY}:${id}`
    : ACTIVE_COMPANY_STORAGE_KEY;
}

export function resolveActiveTemplateId(
  override?: CompanyTemplateId | null,
): CompanyTemplateId {
  if (override) return override;

  if (typeof window !== "undefined") {
    return getClientActiveCompanyState().templateId;
  }

  // Server callers without user context get the default (fail-closed).
  return DEFAULT_COMPANY_TEMPLATE_ID;
}
