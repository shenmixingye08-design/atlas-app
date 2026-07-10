import { ceoAgent } from "./ceo";
import { plannerAgent } from "./planner";
import { reviewerAgent } from "./reviewer";
import type { AgentDefinition, AgentId, AgentRegistry, AgentRole } from "./types";
import { workerAgent } from "./worker";

/** All registered Atlas agents, keyed by ID. */
export const agentRegistry: AgentRegistry = {
  ceo: ceoAgent,
  planner: plannerAgent,
  worker: workerAgent,
  reviewer: reviewerAgent,
};

/** Ordered list of all agents — useful for UI and orchestration setup. */
export const allAgents: readonly AgentDefinition[] = [
  ceoAgent,
  plannerAgent,
  workerAgent,
  reviewerAgent,
] as const;

/** Look up an agent definition by ID. */
export function getAgentById(id: AgentId): AgentDefinition {
  return agentRegistry[id];
}

/** Look up an agent definition by role. */
export function getAgentByRole(role: AgentRole): AgentDefinition {
  return agentRegistry[role];
}

/** Check whether a string is a valid agent ID. */
export function isAgentId(value: string): value is AgentId {
  return value in agentRegistry;
}
