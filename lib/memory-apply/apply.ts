/**
 * MemoryApply() — one entry point for every AI surface.
 */

import "server-only";

import { MemoryProvider } from "@/lib/memory-apply/provider";
import type { MemoryProviderRequest } from "@/lib/memory-apply/provider";
import {
  buildPersonalizationContext,
  type PersonalizationContext,
} from "@/lib/memory-apply/personalization-context";
import {
  ContextBuilder,
  PromptBuilder,
  type BuiltPrompt,
  type SurfaceContextBundle,
} from "@/lib/memory-apply/prompt-builder";
import { appendMemoryApplyLog } from "@/lib/memory-apply/apply-log";
import { recordMemoryApplyEvent } from "@/lib/memory-apply/metrics";
import {
  compareMemoryQuality,
  expectedTokensFromMemoryValues,
} from "@/lib/memory-apply/quality-diff";
import type { MemoryApplyChannel, MemoryQualityDiff } from "@/lib/memory-apply/types";
import type { PersonalMemoryScope } from "@/lib/personal-memory/types";

export type MemoryApplyInput = {
  userId: string;
  channel: MemoryApplyChannel;
  baseline: string;
  assignment?: string | null;
  automationId?: string | null;
  organizationId?: string | null;
  allowedScopes?: readonly PersonalMemoryScope[] | null;
  deniedScopes?: readonly PersonalMemoryScope[] | null;
  artifactTypes?: readonly string[] | null;
  stepTypes?: readonly string[] | null;
  capabilities?: readonly string[] | null;
  /** Memory OFF for A/B comparison */
  memoryEnabled?: boolean;
  artifactIds?: string[];
  currentInstruction?: Record<string, unknown> | null;
  automationOverrides?: Record<string, unknown> | null;
};

export type MemoryApplyOutput = {
  context: PersonalizationContext;
  prompt: BuiltPrompt;
  surface: SurfaceContextBundle;
  quality: MemoryQualityDiff;
  logId: string;
};

/**
 * Resolve Memory → PersonalizationContext → Prompt → log.
 * Use this from Commander / Automation / Vision / OCR / Deliverables / Prediction.
 */
export async function MemoryApply(
  input: MemoryApplyInput,
): Promise<MemoryApplyOutput> {
  const providerRequest: MemoryProviderRequest = {
    userId: input.userId,
    channel: input.channel,
    assignment: input.assignment,
    automationId: input.automationId,
    organizationId: input.organizationId,
    allowedScopes: input.allowedScopes,
    deniedScopes: input.deniedScopes,
    artifactTypes: input.artifactTypes,
    stepTypes: input.stepTypes,
    capabilities: input.capabilities,
    memoryEnabled: input.memoryEnabled,
    currentInstruction: input.currentInstruction,
    automationOverrides: input.automationOverrides,
  };

  const provider = await MemoryProvider(providerRequest);
  const context = buildPersonalizationContext({
    userId: input.userId,
    channel: input.channel,
    provider,
  });
  const prompt = PromptBuilder({
    baseline: input.baseline,
    context,
  });
  const surface = ContextBuilder({
    baseline: input.baseline,
    context,
  });

  const flatExpected: Record<string, unknown> = {};
  for (const row of provider.personalValues) {
    flatExpected[row.key] = row.value;
    flatExpected[row.scope] = row.summary;
  }
  const expected = expectedTokensFromMemoryValues(flatExpected);
  const quality = compareMemoryQuality({
    before: prompt.baseline,
    after: prompt.withMemory,
    memoryMode: context.mode,
    expectedMemoryTokens: expected,
  });

  const log = appendMemoryApplyLog({
    userId: input.userId,
    organizationId: input.organizationId,
    channel: input.channel,
    mode: context.mode,
    memoryIdsUsed: context.memoryIdsUsed,
    scopesUsed: context.scopesUsed,
    artifactIds: input.artifactIds,
    beforeText: prompt.baseline,
    afterText: prompt.withMemory,
    quality,
  });

  recordMemoryApplyEvent({
    userId: input.userId,
    channel: input.channel,
    memoryMode: context.mode,
    applied: context.mode === "on" && context.memoryIdsUsed.length > 0,
    memoryIdsUsed: context.memoryIdsUsed,
    scopesUsed: context.scopesUsed,
    improvementRate: quality.improvementRate,
    success: true,
  });

  return {
    context,
    prompt,
    surface,
    quality,
    logId: log.id,
  };
}

/**
 * Run Memory OFF and Memory ON for the same baseline (comparison helper).
 */
export async function MemoryApplyComparison(input: {
  userId: string;
  channel: MemoryApplyChannel;
  baseline: string;
  assignment?: string | null;
}): Promise<{
  off: MemoryApplyOutput;
  on: MemoryApplyOutput;
  improvementDelta: number;
}> {
  const off = await MemoryApply({
    ...input,
    memoryEnabled: false,
  });
  const on = await MemoryApply({
    ...input,
    memoryEnabled: true,
  });
  return {
    off,
    on,
    improvementDelta: on.quality.improvementRate - off.quality.improvementRate,
  };
}
