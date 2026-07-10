import { HR_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/hr";

import { defineDepartmentDefinition } from "../define";

export const hrDepartment = defineDepartmentDefinition({
  id: "hr",
  name: "人事",
  description: "採用と組織",
  color: "amber",
  icon: "👥",
  systemPrompt: HR_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Recruiting and job design",
    "HR policies and handbooks",
    "Onboarding and performance frameworks",
    "Org design and internal communications",
  ],
  taskKeywords: [
    "hr",
    "human resources",
    "hiring",
    "recruit",
    "recruiting",
    "onboarding",
    "handbook",
    "policy",
    "performance review",
    "org design",
    "talent",
    "人事",
    "採用",
    "評価",
  ],
  workerEligible: true,
});
