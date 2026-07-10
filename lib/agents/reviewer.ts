import { qualityLead } from "@/lib/employees/employees/quality-assurance";

import { defineAgent } from "./define";

/** Workflow agent instructions — sourced from employee system prompt (`lib/prompts/system/`). */
export const REVIEWER_INSTRUCTIONS = qualityLead.systemPrompt;

export const reviewerAgent = defineAgent({
  id: "reviewer",
  role: "reviewer",
  name: qualityLead.name,
  description:
    "Reviews deliverables for quality, accuracy, and requirement alignment.",
  tier: "quality",
  capabilities: [
    "quality_review",
    "approval",
    "feedback",
  ] as const,
  instructions: REVIEWER_INSTRUCTIONS,
});
