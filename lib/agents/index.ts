/**
 * Atlas Agent Architecture — public exports.
 *
 * Safe for client import: types, definitions, registry.
 * Server-only execution: import from `@/lib/agents/runner` directly.
 */

export type {
  AgentCapability,
  AgentContext,
  AgentDefinition,
  AgentId,
  AgentPriorOutput,
  AgentRegistry,
  AgentRole,
  AgentRunInput,
  AgentRunResult,
  AgentTier,
} from "./types";

export { defineAgent } from "./define";

export { ceoAgent, CEO_INSTRUCTIONS } from "./ceo";
export { plannerAgent, PLANNER_INSTRUCTIONS } from "./planner";
export { workerAgent, WORKER_INSTRUCTIONS } from "./worker";
export { reviewerAgent, REVIEWER_INSTRUCTIONS } from "./reviewer";

export {
  agentRegistry,
  allAgents,
  getAgentById,
  getAgentByRole,
  isAgentId,
} from "./registry";

export {
  CEO_TASKS,
  PLANNER_TASKS,
  REVIEWER_TASKS,
  buildReviewerTaskPrompt,
  buildWorkerTaskPrompt,
} from "./tasks";
export type { WorkTask } from "./tasks";
