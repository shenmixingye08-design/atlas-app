import type {
  ActiveCompanyConfig,
  ActiveCompanyState,
  CompanyTemplate,
  CompanyTemplateId,
} from "./types";
import type { ApplyTemplateResult } from "./apply-template.server";

export type {
  ActiveCompanyConfig,
  ActiveCompanyState,
  AutomationPreset,
  CompanyTemplate,
  CompanyTemplateId,
  MemoryPreferences,
  QualityCriteriaConfig,
  ResearchBehavior,
  TemplateDeliverableConfig,
  TemplateWorkflow,
} from "./types";

export {
  ACTIVE_COMPANY_STORAGE_KEY,
  DEFAULT_COMPANY_TEMPLATE_ID,
} from "./types";

export {
  companyTemplateRegistry,
  companyTemplates,
  findCompanyTemplate,
  getCompanyTemplate,
  getDefaultCompanyTemplate,
  listCompanyTemplateIds,
} from "./registry";

export {
  applyCompanyTemplateClient,
  buildCompanyOrchestrationMetadata,
  getActiveCompanyConfig,
  getCompanyResearchGuidance,
  loadCompanyTemplate,
} from "./loader";

export type { ApplyTemplateResult } from "./apply-template.server";

export {
  detectCompanyDeliverableFormats,
  getCompanyQualityPassThreshold,
  getCompanyRoutingKeywords,
  getEnabledDepartments,
  resolveCompanyTemplateIdFromMetadata,
} from "./context";

export {
  getClientActiveCompanyState,
  getServerActiveCompanyState,
  resolveActiveTemplateId,
  setClientActiveCompanyState,
} from "./store";

export async function fetchCompanyTemplates(): Promise<CompanyTemplate[]> {
  const response = await fetch("/api/company/templates", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load company templates");
  }
  return response.json() as Promise<CompanyTemplate[]>;
}

export async function fetchActiveCompany(): Promise<{
  state: ActiveCompanyState;
  config: ActiveCompanyConfig;
}> {
  const response = await fetch("/api/company", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load active company");
  }
  return response.json() as Promise<{
    state: ActiveCompanyState;
    config: ActiveCompanyConfig;
  }>;
}

export async function selectCompanyTemplate(
  templateId: CompanyTemplateId,
): Promise<ApplyTemplateResult> {
  const response = await fetch("/api/company", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ templateId }),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? "Failed to select company template");
  }

  return response.json() as Promise<ApplyTemplateResult>;
}
