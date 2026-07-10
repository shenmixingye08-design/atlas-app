import type { DeliverableFormatDetection } from "@/lib/deliverables/types";
import type { WorkerEligibleDepartmentId } from "@/lib/departments/types";
import type { CompanyTemplateId } from "./types";
import { getActiveCompanyConfig } from "./loader";

/** Deliverable detection using active company template rules. */
export function detectCompanyDeliverableFormats(
  assignment: string,
  templateId?: CompanyTemplateId | null,
): DeliverableFormatDetection {
  const config = getActiveCompanyConfig(templateId);
  const haystack = assignment.toLowerCase();

  for (const rule of config.deliverables.keywordRules) {
    const matched = rule.keywords.some((keyword) =>
      haystack.includes(keyword.toLowerCase()),
    );

    if (matched) {
      return {
        formats: [...rule.formats],
        matchedRule: `${config.id}:${rule.id}`,
      };
    }
  }

  return {
    formats: [...config.deliverables.defaultFormats],
    matchedRule: `${config.id}:default`,
  };
}

export function getEnabledDepartments(
  templateId?: CompanyTemplateId | null,
): readonly WorkerEligibleDepartmentId[] {
  return getActiveCompanyConfig(templateId).enabledDepartments;
}

export function getCompanyRoutingKeywords(
  templateId?: CompanyTemplateId | null,
): Partial<Record<WorkerEligibleDepartmentId, readonly string[]>> {
  return getActiveCompanyConfig(templateId).routingKeywords ?? {};
}

export function getCompanyQualityPassThreshold(
  templateId?: CompanyTemplateId | null,
): number {
  return getActiveCompanyConfig(templateId).qualityCriteria.passThreshold;
}

export function resolveCompanyTemplateIdFromMetadata(
  metadata?: Readonly<Record<string, unknown>>,
): CompanyTemplateId | null {
  const value = metadata?.companyTemplateId;
  return typeof value === "string" ? (value as CompanyTemplateId) : null;
}
