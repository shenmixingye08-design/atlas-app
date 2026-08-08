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

/** Read active template id for a specific user on the server. */
export function getServerActiveCompanyStateForUser(
  userId: string,
): ActiveCompanyState {
  if (!userId) return createDefaultState();
  const bucket = getServerUserBucket();
  const existing = bucket.get(userId);
  if (existing) return existing;
  const created = createDefaultState();
  bucket.set(userId, created);
  return created;
}

export function setServerActiveCompanyStateForUser(
  userId: string,
  state: ActiveCompanyState,
): ActiveCompanyState {
  if (!userId) return state;
  getServerUserBucket().set(userId, state);
  return state;
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

/** Read active template id in the browser. */
export function getClientActiveCompanyState(): ActiveCompanyState {
  if (typeof window === "undefined") {
    return createDefaultState();
  }

  try {
    const raw = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
    if (!raw) return createDefaultState();
    return JSON.parse(raw) as ActiveCompanyState;
  } catch {
    return createDefaultState();
  }
}

export function setClientActiveCompanyState(
  state: ActiveCompanyState,
): ActiveCompanyState {
  if (typeof window !== "undefined") {
    localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, JSON.stringify(state));
  }
  return state;
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
