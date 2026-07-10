import {
  DATA_ANALYST_SYSTEM_PROMPT,
  RESEARCH_LEAD_SYSTEM_PROMPT,
} from "@/lib/prompts/system/research";

import { defineEmployee } from "../define";

export const researchLead = defineEmployee({
  id: "research-lead",
  name: "調査リード",
  department: "research",
  role: "調査リード",
  avatar: "🔬",
  color: "cyan",
  specialties: ["market_research", "competitive_analysis", "data_synthesis"] as const,
  systemPrompt: RESEARCH_LEAD_SYSTEM_PROMPT,
});

export const dataAnalyst = defineEmployee({
  id: "research-data-analyst",
  name: "データ分析担当",
  department: "research",
  role: "データ分析担当",
  avatar: "📈",
  color: "cyan",
  specialties: ["data_collection", "metrics", "reporting"] as const,
  systemPrompt: DATA_ANALYST_SYSTEM_PROMPT,
});

export const researchEmployees = [researchLead, dataAnalyst] as const;
