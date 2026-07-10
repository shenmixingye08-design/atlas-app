import { FINANCE_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/finance";

import { defineDepartmentDefinition } from "../define";

export const financeDepartment = defineDepartmentDefinition({
  id: "finance",
  name: "財務",
  description: "予算と分析",
  color: "emerald",
  icon: "💰",
  systemPrompt: FINANCE_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Build budgets and financial models",
    "Analyze ROI and cost structures",
    "Track KPIs and variance",
    "Prepare executive financial summaries",
  ],
  taskKeywords: [
    "finance",
    "financial",
    "budget",
    "forecast",
    "roi",
    "cost",
    "pricing",
    "revenue",
    "p&l",
    "accounting",
    "kpi",
    "財務",
    "予算",
    "コスト",
  ],
  workerEligible: true,
});
