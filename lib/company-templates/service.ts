import { applyCompanyTemplate } from "./apply-template.server";
import { getActiveCompanyConfig } from "./loader";
import { getCompanyTemplate, companyTemplates } from "./registry";
import type { ActiveCompanyConfig, CompanyTemplateId } from "./types";

/** Application service for company template selection. */
export class CompanyTemplateService {
  listTemplates() {
    return companyTemplates;
  }

  getTemplate(id: CompanyTemplateId) {
    return getCompanyTemplate(id);
  }

  getActive(userId?: string | null): ActiveCompanyConfig {
    return getActiveCompanyConfig(undefined, userId);
  }

  selectTemplate(templateId: CompanyTemplateId, userId: string) {
    return applyCompanyTemplate(templateId, userId);
  }
}

export const companyTemplateService = new CompanyTemplateService();
