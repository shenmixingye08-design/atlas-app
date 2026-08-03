/**
 * Chat surface Memory apply — Responses API / conversational AI.
 * Path: MemoryApply → PersonalizationContext → PromptBuilder → LLM.
 */

import "server-only";

import { MemoryApply } from "@/lib/memory-apply/apply";
import type { MemoryApplyOutput } from "@/lib/memory-apply/apply";
import { DEFAULT_INSTRUCTIONS } from "@/lib/openai";

export type ChatMemoryInput = {
  userId: string;
  /** User message / assignment text */
  input: string;
  /** Existing system instructions (defaults to DEFAULT_INSTRUCTIONS) */
  baseInstructions?: string | null;
  organizationId?: string | null;
  memoryEnabled?: boolean;
};

export type ChatMemoryApplyResult = MemoryApplyOutput & {
  /** Instructions ready for Responses API */
  instructions: string;
};

/**
 * Apply shared PersonalizationContext to chat system instructions.
 */
export async function applyMemoryForChat(
  input: ChatMemoryInput,
): Promise<ChatMemoryApplyResult> {
  const base = (input.baseInstructions ?? DEFAULT_INSTRUCTIONS).trim();
  const applied = await MemoryApply({
    userId: input.userId,
    channel: "chat",
    baseline: input.input,
    assignment: input.input.slice(0, 400),
    organizationId: input.organizationId,
    memoryEnabled: input.memoryEnabled,
    capabilities: ["chat"],
    artifactTypes: ["chat"],
  });

  const injection = applied.prompt.injection.fullText.trim();
  const instructions = injection
    ? `${base}\n\n${injection}`
    : base;

  return {
    ...applied,
    instructions,
  };
}
