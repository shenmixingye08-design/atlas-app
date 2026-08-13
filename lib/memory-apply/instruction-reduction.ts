/**
 * Lightweight Memory-on vs Memory-off comparison for TOP3 Cases A–E.
 * No new evaluation platform — token overlap + char/correction deltas only.
 */

import { compareMemoryQuality } from "@/lib/memory-apply/quality-diff";

export type InstructionReductionInput = {
  instructionCharsBefore: number;
  instructionCharsAfter: number;
  correctionCountBefore: number;
  correctionCountAfter: number;
  beforeBody: string;
  afterBody: string;
  memoryAppliedCount: number;
  expectedChannel: string;
  appliedChannels: readonly string[];
};

export type InstructionReductionResult = {
  instructionCharDelta: number;
  instructionReductionRate: number;
  correctionCountDelta: number;
  diffRate: number;
  memoryAppliedCount: number;
  channelScopeCorrect: boolean;
};

export function measureMemoryApplyDelta(
  input: InstructionReductionInput,
): InstructionReductionResult {
  const instructionCharDelta =
    input.instructionCharsAfter - input.instructionCharsBefore;
  const instructionReductionRate =
    input.instructionCharsBefore <= 0
      ? 0
      : Number(
          Math.max(
            0,
            (input.instructionCharsBefore - input.instructionCharsAfter) /
              input.instructionCharsBefore,
          ).toFixed(4),
        );
  const quality = compareMemoryQuality({
    before: input.beforeBody,
    after: input.afterBody,
    memoryMode: input.memoryAppliedCount > 0 ? "on" : "off",
  });
  const diffRate = Number((1 - quality.overlapRatio).toFixed(4));
  const expected = input.expectedChannel.toLowerCase();
  const channelScopeCorrect =
    input.appliedChannels.length === 0 ||
    input.appliedChannels.some(
      (channel) =>
        channel.toLowerCase() === expected ||
        channel.toLowerCase() === "artifact" ||
        channel.toLowerCase() === "global",
    );

  return {
    instructionCharDelta,
    instructionReductionRate,
    correctionCountDelta:
      input.correctionCountAfter - input.correctionCountBefore,
    diffRate,
    memoryAppliedCount: input.memoryAppliedCount,
    channelScopeCorrect,
  };
}
