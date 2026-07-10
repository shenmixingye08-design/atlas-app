import type { Automation } from "@/lib/automations/types";
import type { WorkflowTemplateId } from "@/lib/automations/types";

import type { AutomationExecutionMode } from "./execution-mode";
import { DEFAULT_EXECUTION_MODE } from "./execution-mode";

/** Job categories shown in cost optimization settings. */
export type JobCategoryId =
  | "blog"
  | "sns"
  | "sales_material"
  | "email"
  | "generic";

export const JOB_CATEGORY_IDS: readonly JobCategoryId[] = [
  "blog",
  "sns",
  "sales_material",
  "email",
  "generic",
] as const;

export const DEFAULT_CATEGORY_EXECUTION_MODES: Readonly<
  Record<JobCategoryId, AutomationExecutionMode>
> = {
  blog: "eco",
  sns: "eco",
  sales_material: "standard",
  email: "high_quality",
  generic: "eco",
};

export function jobCategoryFromTemplate(
  templateId: WorkflowTemplateId,
): JobCategoryId {
  switch (templateId) {
    case "blog":
      return "blog";
    case "sns_post":
      return "sns";
    case "sales_material":
      return "sales_material";
    case "video":
      return "generic";
    default:
      return "generic";
  }
}

export function jobCategoryFromAutomation(automation: Automation): JobCategoryId {
  const templateId = automation.executionFlow?.templateId ?? "generic";
  if (templateId !== "generic") {
    return jobCategoryFromTemplate(templateId);
  }

  const text = `${automation.name} ${automation.workflow.assignment}`.toLowerCase();
  if (/sns|twitter|x（|x\(|instagram|投稿/.test(text)) return "sns";
  if (/ブログ|blog/.test(text)) return "blog";
  if (/営業|資料|proposal|deck/.test(text)) return "sales_material";
  if (/メール|email|mail/.test(text)) return "email";
  return "generic";
}
