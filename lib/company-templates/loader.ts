import { getCompanyTemplate } from "./registry";
import {
  getClientActiveCompanyState,
  getServerActiveCompanyState,
  setClientActiveCompanyState,
} from "./store";
import type {
  ActiveCompanyConfig,
  ActiveCompanyState,
  CompanyTemplate,
  CompanyTemplateId,
} from "./types";
import { DEFAULT_COMPANY_TEMPLATE_ID } from "./types";

/** Load a template definition by id. */
export function loadCompanyTemplate(
  id: CompanyTemplateId = DEFAULT_COMPANY_TEMPLATE_ID,
): CompanyTemplate {
  return getCompanyTemplate(id);
}

/** Resolve the active company configuration for runtime modules. */
export function getActiveCompanyConfig(
  templateId?: CompanyTemplateId | null,
): ActiveCompanyConfig {
  const state =
    typeof window !== "undefined"
      ? getClientActiveCompanyState()
      : getServerActiveCompanyState();

  const id = templateId ?? state.templateId;
  const template = getCompanyTemplate(id);

  return {
    ...template,
    selectedAt: state.selectedAt,
  };
}

/** Metadata injected into orchestration — does not change pipeline code paths. */
export function buildCompanyOrchestrationMetadata(
  templateId?: CompanyTemplateId | null,
): Record<string, unknown> {
  const config = getActiveCompanyConfig(templateId);

  return {
    companyTemplateId: config.id,
    companyTemplateName: config.name,
    companyBrandColor: config.brandColor,
    enabledDepartments: [...config.enabledDepartments],
    memoryPreferences: config.memoryPreferences,
    researchBehavior: config.researchBehavior,
    qualityCriteria: config.qualityCriteria,
    preferredLanguage: config.memoryPreferences.preferredLanguage,
  };
}

/** Research assessment prompt supplement from active company template. */
export function getCompanyResearchGuidance(
  templateId?: CompanyTemplateId | null,
): string {
  return getActiveCompanyConfig(templateId).researchBehavior.guidance;
}

/** Client-safe activation (persists locally; server sync via API). */
export function applyCompanyTemplateClient(
  templateId: CompanyTemplateId,
): ActiveCompanyState {
  const state: ActiveCompanyState = {
    templateId,
    selectedAt: new Date().toISOString(),
  };
  setClientActiveCompanyState(state);
  return state;
}
