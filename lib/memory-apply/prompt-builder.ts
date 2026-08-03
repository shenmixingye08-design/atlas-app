/**
 * PromptBuilder / PromptInjection / ContextBuilder — unified prompt assembly.
 * Does not call AI; only prepares text context for existing engines.
 */

import type { PersonalizationContext } from "@/lib/memory-apply/personalization-context";
import { applyContentOverlayToText } from "@/lib/memory-apply/overlays";
import { buildMemoryInjectionHeader } from "@/lib/atlas-personality";

export type PromptInjectionBlock = {
  header: string;
  body: string;
  fullText: string;
  tokenEstimate: number;
  memoryIdsUsed: string[];
  scopesUsed: string[];
};

/** Build the Memory injection block for any AI prompt. */
export function PromptInjection(
  context: PersonalizationContext,
): PromptInjectionBlock {
  if (context.mode === "off" || !context.injectionText.trim()) {
    return {
      header: "",
      body: "",
      fullText: "",
      tokenEstimate: 0,
      memoryIdsUsed: [],
      scopesUsed: [],
    };
  }
  const header = buildMemoryInjectionHeader();
  const body = context.injectionText.trim();
  const fullText = `${header}\n${body}`;
  return {
    header,
    body,
    fullText,
    tokenEstimate: context.tokenEstimate,
    memoryIdsUsed: context.memoryIdsUsed,
    scopesUsed: context.scopesUsed,
  };
}

export type BuiltPrompt = {
  /** Original user / assignment text */
  baseline: string;
  /** Text with Memory applied */
  withMemory: string;
  /** Injection block alone */
  injection: PromptInjectionBlock;
  mode: PersonalizationContext["mode"];
};

/** Assemble baseline + Memory for generators / vision / automation. */
export function PromptBuilder(input: {
  baseline: string;
  context: PersonalizationContext;
}): BuiltPrompt {
  const injection = PromptInjection(input.context);
  const withMemory =
    input.context.mode === "on"
      ? applyContentOverlayToText(input.baseline, input.context.content)
      : input.baseline;
  return {
    baseline: input.baseline,
    withMemory,
    injection,
    mode: input.context.mode,
  };
}

export type SurfaceContextBundle = {
  channel: PersonalizationContext["channel"];
  personalization: PersonalizationContext;
  prompt: BuiltPrompt;
  plannerKnowledge: string | null;
  workerHints: string | null;
};

/**
 * ContextBuilder — surface-ready bundle for Commander / Vision / Deliverables.
 */
export function ContextBuilder(input: {
  baseline: string;
  context: PersonalizationContext;
}): SurfaceContextBundle {
  const prompt = PromptBuilder(input);
  const plannerKnowledge =
    input.context.mode === "on" && prompt.injection.fullText
      ? prompt.injection.fullText
      : null;
  const workerHints =
    input.context.mode === "on"
      ? [
          input.context.facts.writingStyle
            ? `文体: ${input.context.facts.writingStyle}`
            : null,
          input.context.facts.tone ? `口調: ${input.context.facts.tone}` : null,
          input.context.facts.companyName
            ? `会社: ${input.context.facts.companyName}`
            : null,
          input.context.facts.forbiddenExpressions.length > 0
            ? `禁止: ${input.context.facts.forbiddenExpressions.join("、")}`
            : null,
        ]
          .filter(Boolean)
          .join("\n") || null
      : null;

  return {
    channel: input.context.channel,
    personalization: input.context,
    prompt,
    plannerKnowledge,
    workerHints,
  };
}
