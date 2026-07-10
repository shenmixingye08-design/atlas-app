import { CEO_OFFICE_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/ceo-office";

import { defineDepartmentDefinition } from "../define";

export const ceoOfficeDepartment = defineDepartmentDefinition({
  id: "ceo-office",
  name: "CEO室",
  description: "経営判断と最終決裁",
  color: "violet",
  icon: "👔",
  systemPrompt: CEO_OFFICE_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Strategic direction and goal setting",
    "Executive decisions and delegation",
    "Cross-department alignment",
  ],
  taskKeywords: ["ceo", "executive", "strategy", "leadership", "経営"],
  workerEligible: false,
});
