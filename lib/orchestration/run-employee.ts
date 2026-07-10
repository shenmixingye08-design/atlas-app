import "server-only";

import { runAgent } from "@/lib/agents/runner";
import { getAgentById } from "@/lib/agents/registry";
import type { AgentId, AgentRunInput, AgentRunResult } from "@/lib/agents/types";
import type { EmployeeId } from "@/lib/employees/types";
import { findEmployeeById } from "@/lib/employees/registry";
import {
  getCompactInstructions,
  shouldUseCompactInstructions,
} from "@/lib/ai/compact-instructions";
import { wrapWorkflowInstructions } from "@/lib/atlas-personality";

/**
 * Runs a workflow agent. Uses compact system instructions when aiTaskType is set
 * (avoids sending ~800+ token employee prompts on every call).
 */
export async function runWorkflowEmployee(
  agentId: AgentId,
  employeeId: EmployeeId | undefined,
  input: AgentRunInput,
): Promise<AgentRunResult> {
  const agent = getAgentById(agentId);
  const employee = employeeId ? findEmployeeById(employeeId) : undefined;

  const instructions =
    input.aiTaskType && shouldUseCompactInstructions(input.aiTaskType)
      ? getCompactInstructions(input.aiTaskType, employee?.name ?? agent.name)
      : wrapWorkflowInstructions(employee?.systemPrompt ?? agent.instructions);

  return runAgent(
    {
      ...agent,
      name: employee?.name ?? agent.name,
      instructions,
    },
    input,
  );
}

/** Exposed for accurate cost metering. */
export function resolveWorkflowInstructions(
  agentId: AgentId,
  employeeId: EmployeeId | undefined,
  aiTaskType?: AgentRunInput["aiTaskType"],
): string {
  const agent = getAgentById(agentId);
  const employee = employeeId ? findEmployeeById(employeeId) : undefined;

  if (aiTaskType && shouldUseCompactInstructions(aiTaskType)) {
    return getCompactInstructions(aiTaskType, employee?.name ?? agent.name);
  }
  return wrapWorkflowInstructions(employee?.systemPrompt ?? agent.instructions);
}
