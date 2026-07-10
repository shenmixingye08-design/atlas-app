import { LEGAL_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/legal";

import { defineDepartmentDefinition } from "../define";

export const legalDepartment = defineDepartmentDefinition({
  id: "legal",
  name: "法務",
  description: "契約とコンプライアンス",
  color: "slate",
  icon: "⚖️",
  systemPrompt: LEGAL_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Review contracts and legal risk",
    "Draft compliance documentation",
    "Advise on regulatory requirements",
    "Flag issues requiring human legal review",
  ],
  taskKeywords: [
    "legal",
    "law",
    "contract",
    "compliance",
    "regulatory",
    "policy",
    "terms",
    "privacy",
    "gdpr",
    "risk",
    "法務",
    "契約",
    "コンプライアンス",
  ],
  workerEligible: true,
});
