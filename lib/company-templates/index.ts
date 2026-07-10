export type {
  ActiveCompanyConfig,
  ActiveCompanyState,
  CompanyTemplate,
  CompanyTemplateId,
} from "./types";

export {
  companyTemplates,
  getCompanyTemplate,
  getDefaultCompanyTemplate,
} from "./registry";

export {
  getActiveCompanyConfig,
  buildCompanyOrchestrationMetadata,
  loadCompanyTemplate,
} from "./loader";

export {
  detectCompanyDeliverableFormats,
  getCompanyQualityPassThreshold,
  getEnabledDepartments,
} from "./context";

export {
  fetchActiveCompany,
  fetchCompanyTemplates,
  selectCompanyTemplate,
} from "./client";

export { companyTemplateService } from "./service";
