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

function getServerBucket(): ActiveCompanyState {
  const globalScope = globalThis as typeof globalThis & {
    __atlasActiveCompany?: ActiveCompanyState;
  };

  if (!globalScope.__atlasActiveCompany) {
    globalScope.__atlasActiveCompany = createDefaultState();
  }

  return globalScope.__atlasActiveCompany;
}

/** Read active template id on the server (API routes, deliverables, orchestration). */
export function getServerActiveCompanyState(): ActiveCompanyState {
  return getServerBucket();
}

export function setServerActiveCompanyState(
  state: ActiveCompanyState,
): ActiveCompanyState {
  const globalScope = globalThis as typeof globalThis & {
    __atlasActiveCompany?: ActiveCompanyState;
  };
  globalScope.__atlasActiveCompany = state;
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

  return getServerActiveCompanyState().templateId;
}
