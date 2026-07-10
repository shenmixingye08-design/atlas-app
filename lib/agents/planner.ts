import { leadPlanner } from "@/lib/employees/employees/planning";

import { defineAgent } from "./define";

/** Workflow agent instructions — sourced from employee system prompt (`lib/prompts/system/`). */
export const PLANNER_INSTRUCTIONS = leadPlanner.systemPrompt;

export const plannerAgent = defineAgent({
  id: "planner",
  role: "planner",
  name: leadPlanner.name,
  description:
    "Decomposes assignments into structured, actionable execution plans.",
  tier: "planning",
  capabilities: [
    "task_decomposition",
    "scheduling",
    "resource_estimation",
  ] as const,
  instructions: PLANNER_INSTRUCTIONS,
});
