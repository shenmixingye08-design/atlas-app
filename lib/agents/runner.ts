import "server-only";

import type { Stream } from "openai/streaming";
import type { ResponseStreamEvent } from "openai/resources/responses/responses";

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
 * Builds the full prompt sent to the Responses API for a given agent run.
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
 * Runs any agent definition against the OpenAI Responses API.
 * This is the single execution entry point until orchestration is built.
 */
export async function runAgent(
  agent: AgentDefinition,
  input: AgentRunInput,
): Promise<AgentRunResult> {
  const promptInput = buildAgentInput(input.task, input.context);

  const response = await createAtlasResponse({
    input: promptInput,
    instructions: agent.instructions,
    previousResponseId: input.previousResponseId,
    aiTaskType: input.aiTaskType,
  });

  const outputText = response.output_text ?? "";
  const status = response.status ?? "unknown";
  const incompleteReason =
    (response as { incomplete_details?: { reason?: string } | null })
      .incomplete_details?.reason ?? null;

  // Empty / incomplete Responses must not collapse into a generic
  // "成果物をうまく作れませんでした" with no developer signal.
  if (status === "incomplete" || incompleteReason === "max_output_tokens") {
    const detail = [
      `agent=${agent.id}`,
      `aiTaskType=${input.aiTaskType ?? "unknown"}`,
      `status=${status}`,
      `incompleteReason=${incompleteReason ?? "unknown"}`,
      `developerCode=output_token_limit`,
    ].join(" ");
    console.error("[agents.runner] incomplete OpenAI output", {
      agentId: agent.id,
      aiTaskType: input.aiTaskType ?? null,
      status,
      incompleteReason,
      responseId: response.id ?? null,
    });
    throw new Error(
      `AI応答が上限で途中終了しました（${detail}）。字数を分けて依頼するか、もう一度お試しください。`,
    );
  }

  if (!outputText.trim()) {
    const detail = [
      `agent=${agent.id}`,
      `aiTaskType=${input.aiTaskType ?? "unknown"}`,
      `status=${status}`,
      `model=${response.model ?? "unknown"}`,
      `responseId=${response.id ?? "none"}`,
    ].join(" ");
    console.error("[agents.runner] empty OpenAI output", {
      agentId: agent.id,
      aiTaskType: input.aiTaskType ?? null,
      status,
      model: response.model ?? null,
      responseId: response.id ?? null,
      jobId:
        typeof input.context?.metadata?.jobId === "string"
          ? input.context.metadata.jobId
          : typeof input.context?.metadata?.workJobId === "string"
            ? input.context.metadata.workJobId
            : null,
    });
    throw new Error(
      `AI応答が空でした（${detail}）。もう一度お試しください。`,
    );
  }

  return {
    agentId: agent.id,
    role: agent.role,
    name: agent.name,
    outputText,
    responseId: response.id,
    status,
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
    input: buildAgentInput(input.task, input.context),
    instructions: agent.instructions,
    previousResponseId: input.previousResponseId,
    aiTaskType: input.aiTaskType ?? "chat",
  });
}
