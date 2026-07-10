import {
  ATLAS_CEO_SYSTEM_PROMPT,
  EXECUTIVE_ASSISTANT_SYSTEM_PROMPT,
} from "@/lib/prompts/system/ceo-office";

import { defineEmployee } from "../define";

/** CEO Office — workflow-linked executive (maps to `ceo` agent). */
export const atlasCeo = defineEmployee({
  id: "ceo-office-atlas-ceo",
  name: "Atlas CEO",
  department: "ceo-office",
  role: "最高経営責任者",
  avatar: "👔",
  color: "violet",
  workflowAgentId: "ceo",
  specialties: [
    "goal_interpretation",
    "priority_setting",
    "delegation",
    "strategic_decisions",
  ] as const,
  systemPrompt: ATLAS_CEO_SYSTEM_PROMPT,
});

export const executiveAssistant = defineEmployee({
  id: "ceo-office-exec-assistant",
  name: "経営アシスタント",
  department: "ceo-office",
  role: "経営アシスタント",
  avatar: "📋",
  color: "violet",
  specialties: ["scheduling", "briefings", "stakeholder_comms"] as const,
  systemPrompt: EXECUTIVE_ASSISTANT_SYSTEM_PROMPT,
});

export const ceoOfficeEmployees = [atlasCeo, executiveAssistant] as const;
