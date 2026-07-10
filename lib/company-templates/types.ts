import type { CreateAutomationInput } from "@/lib/automations/types";
import type { WorkerEligibleDepartmentId } from "@/lib/departments/types";
import type { DeliverableFormat } from "@/lib/deliverables/types";
import type { ResearchCategory } from "@/lib/orchestration/types";
import type { QualityCriterionKey } from "@/lib/orchestration/parse-quality";

/** Built-in company template identifiers. */
export type CompanyTemplateId =
  | "blogging"
  | "affiliate"
  | "youtube"
  | "sales"
  | "real-estate"
  | "ecommerce"
  | "saas"
  | "marketing-agency";

/** Suggested workflow the user can launch from the workspace. */
export type TemplateWorkflow = {
  id: string;
  name: string;
  description: string;
  sampleAssignment: string;
};

/** Deliverable defaults and keyword overrides for this company type. */
export type TemplateDeliverableConfig = {
  defaultFormats: readonly DeliverableFormat[];
  keywordRules: readonly {
    id: string;
    keywords: readonly string[];
    formats: readonly DeliverableFormat[];
  }[];
};

/** How the Research department should behave for this company. */
export type ResearchBehavior = {
  /** When true, bias assessment toward requiring external research. */
  defaultRequired: boolean;
  priorityCategories: readonly ResearchCategory[];
  triggerKeywords: readonly string[];
  /** Appended to the research assessment prompt. */
  guidance: string;
};

/** QA scoring emphasis for this company type. */
export type QualityCriteriaConfig = {
  passThreshold: number;
  emphasis: Partial<Record<QualityCriterionKey, "high" | "medium" | "low">>;
};

/** Memory / persistence preferences (future Memory layer wiring). */
export type MemoryPreferences = {
  retainResearchReports: boolean;
  retainQualityReviews: boolean;
  conversationHistoryDays: number;
  preferredLanguage: string;
  /** Tags applied to WorkflowRun / Project records. */
  tags: readonly string[];
};

/** Automation preset merged when a template is activated. */
export type AutomationPreset = CreateAutomationInput & {
  id: string;
};

/** Full definition of a specialized AI company template. */
export interface CompanyTemplate {
  id: CompanyTemplateId;
  name: string;
  description: string;
  icon: string;
  brandColor: string;
  enabledDepartments: readonly WorkerEligibleDepartmentId[];
  defaultWorkflows: readonly TemplateWorkflow[];
  deliverables: TemplateDeliverableConfig;
  automationPresets: readonly AutomationPreset[];
  memoryPreferences: MemoryPreferences;
  researchBehavior: ResearchBehavior;
  qualityCriteria: QualityCriteriaConfig;
  /** Extra routing keywords per department. */
  routingKeywords?: Partial<
    Record<WorkerEligibleDepartmentId, readonly string[]>
  >;
}

/** Persisted selection — switching templates does not delete user data. */
export type ActiveCompanyState = {
  templateId: CompanyTemplateId;
  selectedAt: string;
};

/** Resolved runtime configuration derived from the active template. */
export type ActiveCompanyConfig = CompanyTemplate & {
  selectedAt: string;
};

export const DEFAULT_COMPANY_TEMPLATE_ID: CompanyTemplateId = "marketing-agency";

export const ACTIVE_COMPANY_STORAGE_KEY = "atlas-active-company-template";
