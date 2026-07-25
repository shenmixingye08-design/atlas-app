import "server-only";

import type { Stream } from "openai/streaming";
import type {
  ResponseInput,
  ResponseStreamEvent,
} from "openai/resources/responses/responses";

import { buildMultimodalResponseInput } from "@/lib/attachments/to-response-input";
import {
  createAtlasResponse,
  createAtlasResponseStream,
} from "@/lib/openai";

import type {
  AgentContext,
  AgentDefinition,
  AgentId,
  AgentPriorOutput,
  AgentRunInput,
  AgentRunResult,
} from "./types";
import { getAgentById } from "./registry";

function formatPriorOutputs(outputs: readonly AgentPriorOutput[]): string {
  return outputs
    .map(
      (entry) =>
        `### ${entry.agentId.toUpperCase()} Agent\n${entry.output.trim()}`,
    )
    .join("\n\n");
}

/**
 * Builds the full prompt text sent to the Responses API for a given agent run.
 * Separates workflow context from the agent's specific task.
 */
export function buildAgentInput(
  task: string,
  context?: AgentContext,
): string {
  const sections: string[] = [];

  if (context?.assignment) {
    sections.push(
      `## Original Assignment\n${context.assignment.trim()}`,
    );
  }

  if (context?.priorOutputs?.length) {
    sections.push(
      `## Prior Agent Outputs\n${formatPriorOutputs(context.priorOutputs)}`,
    );
  }

  sections.push(`## Your Task\n${task.trim()}`);

  return sections.join("\n\n");
}

/**
 * Builds Responses API `input`, attaching available images as `input_image`
 * when attachment metadata references stored image bytes.
 */
export function buildAgentResponseInput(
  task: string,
  context?: AgentContext,
): string | ResponseInput {
  const promptText = buildAgentInput(task, context);
  return buildMultimodalResponseInput(promptText, context?.metadata);
}

/**
 * Runs any agent definition against the OpenAI Responses API.
 * This is the single execution entry point until orchestration is built.
 */
export async function runAgent(
  agent: AgentDefinition,
  input: AgentRunInput,
): Promise<AgentRunResult> {
  const promptInput = buildAgentResponseInput(input.task, input.context);

  const response = await createAtlasResponse({
    input: promptInput,
    instructions: agent.instructions,
    previousResponseId: input.previousResponseId,
    aiTaskType: input.aiTaskType,
  });

  return {
    agentId: agent.id,
    role: agent.role,
    name: agent.name,
    outputText: response.output_text,
    responseId: response.id,
    status: response.status ?? "unknown",
    model: response.model,
  };
}

/** Runs an agent by ID — convenience wrapper around `runAgent`. */
export async function runAgentById(
  id: AgentId,
  input: AgentRunInput,
): Promise<AgentRunResult> {
  return runAgent(getAgentById(id), input);
}

/**
 * Streams an agent response via the OpenAI Responses API.
 * Available for future real-time UI integrations.
 */
export async function runAgentStream(
  agent: AgentDefinition,
  input: AgentRunInput,
): Promise<Stream<ResponseStreamEvent>> {
  return createAtlasResponseStream({
    input: buildAgentResponseInput(input.task, input.context),
    instructions: agent.instructions,
    previousResponseId: input.previousResponseId,
    aiTaskType: input.aiTaskType ?? "chat",
  });
}
