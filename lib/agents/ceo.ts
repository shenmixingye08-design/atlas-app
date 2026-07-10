import { atlasCeo } from "@/lib/employees/employees/ceo-office";

import { defineAgent } from "./define";

/** Workflow agent instructions — sourced from employee system prompt (`lib/prompts/system/`). */
export const CEO_INSTRUCTIONS = atlasCeo.systemPrompt;

export const ceoAgent = defineAgent({
  id: "ceo",
  role: "ceo",
  name: atlasCeo.name,
  description:
    "Interprets user goals, sets strategic priorities, and directs the agent team.",
  tier: "leadership",
  capabilities: [
    "goal_interpretation",
    "priority_setting",
    "delegation",
  ] as const,
  instructions: CEO_INSTRUCTIONS,
});
