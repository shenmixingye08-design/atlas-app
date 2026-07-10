import { QUALITY_ASSURANCE_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/quality-assurance";

import { defineDepartmentDefinition } from "../define";

export const qualityAssuranceDepartment = defineDepartmentDefinition({
  id: "quality-assurance",
  name: "品質保証",
  description: "品質確認と基準管理",
  color: "green",
  icon: "✅",
  systemPrompt: QUALITY_ASSURANCE_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Deliverable review and approval",
    "Quality standards enforcement",
    "Structured feedback before completion",
  ],
  taskKeywords: ["qa", "quality", "review", "approve", "test", "品質"],
  workerEligible: false,
});
