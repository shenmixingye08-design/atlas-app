import { SALES_DEPARTMENT_SYSTEM_PROMPT } from "@/lib/prompts/system/sales";

import { defineDepartmentDefinition } from "../define";

export const salesDepartment = defineDepartmentDefinition({
  id: "sales",
  name: "営業",
  description: "売上と顧客関係",
  color: "rose",
  icon: "🤝",
  systemPrompt: SALES_DEPARTMENT_SYSTEM_PROMPT,
  defaultResponsibilities: [
    "Build pipeline and outreach strategy",
    "Draft proposals and sales collateral",
    "Manage accounts and negotiations",
    "Forecast revenue and win/loss analysis",
  ],
  taskKeywords: [
    "sales",
    "sell",
    "selling",
    "pipeline",
    "deal",
    "proposal",
    "outreach",
    "prospect",
    "lead",
    "crm",
    "quota",
    "revenue",
    "営業",
    "商談",
    "提案",
  ],
  workerEligible: true,
});
