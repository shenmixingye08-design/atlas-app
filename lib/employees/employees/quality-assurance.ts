import {
  QA_SPECIALIST_SYSTEM_PROMPT,
  QUALITY_LEAD_SYSTEM_PROMPT,
} from "@/lib/prompts/system/quality-assurance";

import { defineEmployee } from "../define";

/** Quality Assurance — workflow-linked reviewer (maps to `reviewer` agent). */
export const qualityLead = defineEmployee({
  id: "qa-quality-lead",
  name: "品質リード",
  department: "quality-assurance",
  role: "品質リード",
  avatar: "✅",
  color: "green",
  workflowAgentId: "reviewer",
  specialties: [
    "quality_review",
    "approval",
    "feedback",
  ] as const,
  systemPrompt: QUALITY_LEAD_SYSTEM_PROMPT,
});

export const qaSpecialist = defineEmployee({
  id: "qa-specialist",
  name: "品質確認担当",
  department: "quality-assurance",
  role: "品質確認担当",
  avatar: "🔍",
  color: "green",
  specialties: ["test_plans", "regression_checks", "documentation_review"] as const,
  systemPrompt: QA_SPECIALIST_SYSTEM_PROMPT,
});

export const qualityAssuranceEmployees = [qualityLead, qaSpecialist] as const;
