import { RESEARCH_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/research";

import { defineDepartmentDefinition } from "../define";

export const researchDepartment = defineDepartmentDefinition({
  id: "research",
  name: "調査",
  description: "情報収集と分析",
  color: "cyan",
  icon: "🔬",
  systemPrompt: RESEARCH_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Conduct market and competitive research",
    "Gather and synthesize data",
    "Validate assumptions with evidence",
    "Produce insight reports",
  ],
  taskKeywords: [
    "research",
    "analyze",
    "analysis",
    "market",
    "competitive",
    "competitor",
    "survey",
    "data",
    "insights",
    "benchmark",
    "調査",
    "リサーチ",
    "分析",
    "市場",
  ],
  workerEligible: true,
});
