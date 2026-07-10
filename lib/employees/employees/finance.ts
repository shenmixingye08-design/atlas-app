import {
  FINANCE_DIRECTOR_SYSTEM_PROMPT,
  FINANCIAL_ANALYST_SYSTEM_PROMPT,
} from "@/lib/prompts/system/finance";

import { defineEmployee } from "../define";

export const financeDirector = defineEmployee({
  id: "finance-director",
  name: "財務ディレクター",
  department: "finance",
  role: "財務ディレクター",
  avatar: "💰",
  color: "emerald",
  specialties: ["budgeting", "forecasting", "financial_reporting"] as const,
  systemPrompt: FINANCE_DIRECTOR_SYSTEM_PROMPT,
});

export const financialAnalyst = defineEmployee({
  id: "finance-analyst",
  name: "財務分析担当",
  department: "finance",
  role: "財務分析担当",
  avatar: "🧮",
  color: "emerald",
  specialties: ["variance_analysis", "kpi_tracking", "spreadsheets"] as const,
  systemPrompt: FINANCIAL_ANALYST_SYSTEM_PROMPT,
});

export const financeEmployees = [financeDirector, financialAnalyst] as const;
