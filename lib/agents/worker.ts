import { seniorDeveloper } from "@/lib/employees/employees/development";

import { defineAgent } from "./define";

/** Workflow agent instructions — sourced from employee system prompt (`lib/prompts/system/`). */
export const WORKER_INSTRUCTIONS = seniorDeveloper.systemPrompt;

export const workerAgent = defineAgent({
  id: "worker",
  role: "worker",
  name: seniorDeveloper.name,
  description:
    "Executes assigned tasks and produces concrete deliverables.",
  tier: "execution",
  capabilities: [
    "task_execution",
    "content_generation",
    "research",
  ] as const,
  instructions: WORKER_INSTRUCTIONS,
});
