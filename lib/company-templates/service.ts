import { applyCompanyTemplateForUser } from "./apply-template.server";
import { getActiveCompanyConfigForUser } from "./loader";
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

  getActiveForUser(userId: string): ActiveCompanyConfig {
    return getActiveCompanyConfigForUser(userId);
  }

  /** @deprecated Prefer getActiveForUser */
  getActive(): ActiveCompanyConfig {
    return getActiveCompanyConfigForUser("");
  }

  selectTemplateForUser(userId: string, templateId: CompanyTemplateId) {
    return applyCompanyTemplateForUser(userId, templateId);
  }

  /** @deprecated Prefer selectTemplateForUser */
  selectTemplate(templateId: CompanyTemplateId) {
    void templateId;
    throw new Error("selectTemplate requires userId — use selectTemplateForUser");
  }
}

export const companyTemplateService = new CompanyTemplateService();
