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

  getActive(): ActiveCompanyConfig {
    return getActiveCompanyConfig();
  }

  selectTemplate(templateId: CompanyTemplateId) {
    return applyCompanyTemplate(templateId);
  }
}

export const companyTemplateService = new CompanyTemplateService();
