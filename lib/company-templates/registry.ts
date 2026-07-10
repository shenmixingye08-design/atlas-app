import type { CompanyTemplate, CompanyTemplateId } from "./types";
import { DEFAULT_COMPANY_TEMPLATE_ID } from "./types";
import { allCompanyTemplates } from "./definitions/templates";

export type CompanyTemplateRegistry = Readonly<
  Record<CompanyTemplateId, CompanyTemplate>
>;

function buildRegistry(
  templates: readonly CompanyTemplate[],
): CompanyTemplateRegistry {
  return templates.reduce<Record<CompanyTemplateId, CompanyTemplate>>(
    (registry, template) => {
      registry[template.id] = template;
      return registry;
    },
    {} as Record<CompanyTemplateId, CompanyTemplate>,
  );
}

export const companyTemplateRegistry: CompanyTemplateRegistry =
  buildRegistry(allCompanyTemplates);

export const companyTemplates: readonly CompanyTemplate[] = allCompanyTemplates;

export function getCompanyTemplate(id: CompanyTemplateId): CompanyTemplate {
  const template = companyTemplateRegistry[id];
  if (!template) {
    throw new Error(`Company template not found: ${id}`);
  }
  return template;
}

export function findCompanyTemplate(id: string): CompanyTemplate | undefined {
  return companyTemplateRegistry[id as CompanyTemplateId];
}

export function getDefaultCompanyTemplate(): CompanyTemplate {
  return getCompanyTemplate(DEFAULT_COMPANY_TEMPLATE_ID);
}

export function listCompanyTemplateIds(): CompanyTemplateId[] {
  return companyTemplates.map((template) => template.id);
}
