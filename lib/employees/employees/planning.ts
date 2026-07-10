import {
  LEAD_PLANNER_SYSTEM_PROMPT,
  PROJECT_COORDINATOR_SYSTEM_PROMPT,
} from "@/lib/prompts/system/planning";

import { defineEmployee } from "../define";

/** Planning — workflow-linked planner (maps to `planner` agent). */
export const leadPlanner = defineEmployee({
  id: "planning-lead-planner",
  name: "企画リード",
  department: "planning",
  role: "企画リード",
  avatar: "📊",
  color: "sky",
  workflowAgentId: "planner",
  specialties: [
    "task_decomposition",
    "scheduling",
    "resource_estimation",
  ] as const,
  systemPrompt: LEAD_PLANNER_SYSTEM_PROMPT,
});

export const projectCoordinator = defineEmployee({
  id: "planning-coordinator",
  name: "プロジェクトコーディネーター",
  department: "planning",
  role: "プロジェクトコーディネーター",
  avatar: "🗓️",
  color: "sky",
  specialties: ["timeline_tracking", "dependencies", "status_reporting"] as const,
  systemPrompt: PROJECT_COORDINATOR_SYSTEM_PROMPT,
});

export const planningEmployees = [leadPlanner, projectCoordinator] as const;
