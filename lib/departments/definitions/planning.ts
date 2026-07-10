import { PLANNING_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/planning";

import { defineDepartmentDefinition } from "../define";

export const planningDepartment = defineDepartmentDefinition({
  id: "planning",
  name: "企画",
  description: "仕事の分解と実行計画",
  color: "sky",
  icon: "📋",
  systemPrompt: PLANNING_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Task decomposition and scheduling",
    "Dependency and effort estimation",
    "Department routing in execution plans",
  ],
  taskKeywords: ["plan", "planning", "schedule", "decompose", "計画"],
  workerEligible: false,
});
