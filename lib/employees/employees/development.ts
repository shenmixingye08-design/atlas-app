import {
  FULL_STACK_ENGINEER_SYSTEM_PROMPT,
  SENIOR_DEVELOPER_SYSTEM_PROMPT,
} from "@/lib/prompts/system/development";

import { defineEmployee } from "../define";

/** Development — workflow-linked worker (maps to `worker` agent). */
export const seniorDeveloper = defineEmployee({
  id: "development-senior-dev",
  name: "シニア開発者",
  department: "development",
  role: "シニア開発者",
  avatar: "⚙️",
  color: "blue",
  workflowAgentId: "worker",
  specialties: [
    "task_execution",
    "content_generation",
    "implementation",
  ] as const,
  systemPrompt: SENIOR_DEVELOPER_SYSTEM_PROMPT,
});

export const fullStackEngineer = defineEmployee({
  id: "development-fullstack",
  name: "フルスタックエンジニア",
  department: "development",
  role: "フルスタックエンジニア",
  avatar: "💻",
  color: "blue",
  specialties: ["web_development", "apis", "debugging"] as const,
  systemPrompt: FULL_STACK_ENGINEER_SYSTEM_PROMPT,
});

export const developmentEmployees = [seniorDeveloper, fullStackEngineer] as const;
