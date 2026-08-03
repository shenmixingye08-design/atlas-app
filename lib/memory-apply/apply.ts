/**
 * MemoryApply() — one entry point for every AI surface.
 */

import "server-only";

import { MemoryProvider } from "@/lib/memory-apply/provider";
import type {
  MemoryProviderRequest,
  MemoryProviderResult,
} from "@/lib/memory-apply/provider";
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
  capabilities?: readonly string[] | null;
  /** Memory OFF for A/B comparison */
  memoryEnabled?: boolean;
  artifactIds?: string[];
  automationOverrides?: Record<string, unknown> | null;
  currentInstruction?: Record<string, unknown> | null;
};

export type MemoryApplyOutput = {
  context: PersonalizationContext;
  prompt: BuiltPrompt;
  surface: SurfaceContextBundle;
  quality: MemoryQualityDiff;
  logId: string;
  /** Raw provider result — adapters must not re-resolve Memory separately */
  provider: MemoryProviderResult;
};

/**
 * Resolve Memory → PersonalizationContext → Prompt → log.
 * Fail Closed: load failure throws (AI must not continue without Memory).
 * Prefer loadMemory() from pipeline.ts for the canonical secretary sequence.
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
    capabilities: input.capabilities,
    memoryEnabled: input.memoryEnabled,
    automationOverrides: input.automationOverrides,
    currentInstruction: input.currentInstruction,
  };

  try {
    const provider = await MemoryProvider(providerRequest);
    const context = buildPersonalizationContext({
      userId: input.userId,
      channel: input.channel,
      provider,
    });
    if (!context.memoryVersion?.checksum) {
      throw new Error("memory_version_incomplete");
    }
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
      provider,
    };
  } catch (error) {
    recordMemoryApplyEvent({
      userId: input.userId,
      channel: input.channel,
      memoryMode: "off",
      applied: false,
      memoryIdsUsed: [],
      scopesUsed: [],
      improvementRate: 0,
      success: false,
      failureReason:
        error instanceof Error ? error.message.slice(0, 200) : "memory_apply_failed",
    });
    throw error;
  }
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
