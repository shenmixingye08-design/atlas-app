import type { MemoryApplyMode, MemoryQualityDiff } from "@/lib/memory-apply/types";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[\s\n\r\t、。,.!?;:：；「」『』（）()\[\]{}<>\/\\|"'`~]+/g)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2);
}

function unique<T>(items: readonly T[]): T[] {
  return [...new Set(items)];
}

/**
 * Compare Memory OFF baseline vs Memory ON result.
 * Pure function — no AI, no side effects.
 */
export function compareMemoryQuality(input: {
  before: string;
  after: string;
  memoryMode: MemoryApplyMode;
  expectedMemoryTokens?: readonly string[];
}): MemoryQualityDiff {
  const before = input.before ?? "";
  const after = input.after ?? "";
  const beforeTokens = tokenize(before);
  const afterTokens = tokenize(after);
  const beforeSet = new Set(beforeTokens);
  const afterSet = new Set(afterTokens);

  const addedTokens = unique(afterTokens.filter((t) => !beforeSet.has(t))).slice(
    0,
    40,
  );
  const removedTokens = unique(
    beforeTokens.filter((t) => !afterSet.has(t)),
  ).slice(0, 40);

  const intersection = beforeTokens.filter((t) => afterSet.has(t)).length;
  const union = new Set([...beforeTokens, ...afterTokens]).size || 1;
  const overlapRatio = Number((intersection / union).toFixed(4));

  const expected = (input.expectedMemoryTokens ?? []).map((t) =>
    t.toLowerCase().trim(),
  );
  let memoryHitCount = 0;
  let memoryMissCount = 0;
  for (const token of expected) {
    if (!token) continue;
    if (after.toLowerCase().includes(token)) memoryHitCount += 1;
    else memoryMissCount += 1;
  }

  const charDelta = after.length - before.length;
  const expectedTotal = expected.length || 1;
  const hitRate = memoryHitCount / expectedTotal;
  // Improvement: memory hits + structural preservation (overlap) + non-empty growth when ON
  const growthBonus =
    input.memoryMode === "on" && after.length > before.length ? 0.1 : 0;
  const improvementRate = Number(
    Math.min(1, Math.max(0, hitRate * 0.7 + overlapRatio * 0.2 + growthBonus)).toFixed(
      4,
    ),
  );

  const qualityScore = Number(
    Math.min(
      100,
      Math.round(
        improvementRate * 70 +
          overlapRatio * 20 +
          (after.trim().length > 0 ? 10 : 0),
      ),
    ).toFixed(2),
  );

  return {
    memoryMode: input.memoryMode,
    beforeCharCount: before.length,
    afterCharCount: after.length,
    charDelta,
    addedTokens,
    removedTokens,
    overlapRatio,
    improvementRate,
    memoryHitCount,
    memoryMissCount,
    qualityScore,
    summary:
      input.memoryMode === "off"
        ? "Memory OFF baseline"
        : `Memory ON: hits=${memoryHitCount}/${expected.length || 0} improvement=${improvementRate}`,
  };
}

/** Extract expected tokens from flat memory values for hit testing. */
export function expectedTokensFromMemoryValues(
  values: Readonly<Record<string, unknown>>,
): string[] {
  const tokens: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === "string" && node.trim()) {
      tokens.push(...tokenize(node).slice(0, 8));
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node as Record<string, unknown>)) {
        walk(value);
      }
    }
  };
  walk(values);
  return unique(tokens).slice(0, 30);
}
