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

type CompanyBucket = Map<string, ActiveCompanyState>;

function getServerBucket(): CompanyBucket {
  const globalScope = globalThis as typeof globalThis & {
    __atlasActiveCompanyByUser?: CompanyBucket;
    /** Legacy global — cleared so it cannot pollute tenants. */
    __atlasActiveCompany?: ActiveCompanyState;
  };

  if (!globalScope.__atlasActiveCompanyByUser) {
    globalScope.__atlasActiveCompanyByUser = new Map();
  }
  // Invalidate legacy process-global state.
  if (globalScope.__atlasActiveCompany) {
    delete globalScope.__atlasActiveCompany;
  }

  return globalScope.__atlasActiveCompanyByUser;
}

/** Read active template id on the server for a specific user. */
export function getServerActiveCompanyState(
  userId?: string | null
): ActiveCompanyState {
  if (!userId) return createDefaultState();
  const bucket = getServerBucket();
  const existing = bucket.get(userId);
  if (existing) return existing;
  const created = createDefaultState();
  bucket.set(userId, created);
  return created;
}

export function setServerActiveCompanyState(
  state: ActiveCompanyState,
  userId?: string | null
): ActiveCompanyState {
  if (!userId) {
    // Refuse to write a process-global active company.
    return state;
  }
  getServerBucket().set(userId, state);
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
  state: ActiveCompanyState
): ActiveCompanyState {
  if (typeof window !== "undefined") {
    localStorage.setItem(ACTIVE_COMPANY_STORAGE_KEY, JSON.stringify(state));
  }
  return state;
}

export function resolveActiveTemplateId(
  override?: CompanyTemplateId | null,
  userId?: string | null
): CompanyTemplateId {
  if (override) return override;

  if (typeof window !== "undefined") {
    return getClientActiveCompanyState().templateId;
  }

  return getServerActiveCompanyState(userId).templateId;
}

export function resetCompanyStoreForTests(): void {
  getServerBucket().clear();
}
