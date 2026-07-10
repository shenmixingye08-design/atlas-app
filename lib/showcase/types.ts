import type { CompanyTemplateId } from "@/lib/company-templates/types";

export type MihonShowcaseCompany = {
  id: string;
  icon: string;
  name: string;
  description: string;
  capabilities: readonly string[];
  /** Subtle contextual hint — plain text, not a badge. */
  recommendation?: string;
  /** Maps to a built-in company template when the user adds this 見本. */
  templateId?: CompanyTemplateId;
  kind: "company" | "original";
};
