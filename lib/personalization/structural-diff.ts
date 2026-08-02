/**
 * Structural preference diffs — not binary whole-file diffs.
 */

import type {
  DiffCategory,
  DiffMetrics,
  PersonalizationContext,
  StructuralDiffMetric,
} from "@/lib/personalization/types";

function countHeadings(text: string): number {
  return (text.match(/^#{1,6}\s/gm) ?? []).length;
}

function countBullets(text: string): number {
  return (text.match(/^[-*•]\s/gm) ?? []).length;
}

function avgSentenceLength(text: string): number {
  const sentences = text.split(/[。．!！?？\n]/).filter((s) => s.trim().length > 0);
  if (sentences.length === 0) return 0;
  return (
    sentences.reduce((sum, s) => sum + s.trim().length, 0) / sentences.length
  );
}

function formalityScore(text: string): number {
  let score = 0;
  if (/です|ます|ございます/.test(text)) score += 2;
  if (/である|だ。/.test(text)) score -= 1;
  if (/お願い|恐れ入り/.test(text)) score += 1;
  return score;
}

export function classifyTextStructuralDiff(
  before: string,
  after: string,
): StructuralDiffMetric[] {
  const metrics: StructuralDiffMetric[] = [];
  const beforeHeadings = countHeadings(before);
  const afterHeadings = countHeadings(after);
  if (beforeHeadings !== afterHeadings) {
    metrics.push({
      category: "headingStructure",
      beforeValue: String(beforeHeadings),
      afterValue: String(afterHeadings),
      magnitude: Math.abs(afterHeadings - beforeHeadings),
    });
  }

  const beforeBullets = countBullets(before);
  const afterBullets = countBullets(after);
  if (beforeBullets !== afterBullets) {
    metrics.push({
      category: "bulletUsage",
      beforeValue: String(beforeBullets),
      afterValue: String(afterBullets),
      magnitude: Math.abs(afterBullets - beforeBullets),
    });
  }

  const beforeLen = avgSentenceLength(before);
  const afterLen = avgSentenceLength(after);
  if (Math.abs(beforeLen - afterLen) > 8) {
    metrics.push({
      category: "sentenceLength",
      beforeValue: beforeLen.toFixed(1),
      afterValue: afterLen.toFixed(1),
      magnitude: Math.abs(afterLen - beforeLen) / Math.max(beforeLen, 1),
    });
    metrics.push({
      category: "verbosity",
      beforeValue: String(before.length),
      afterValue: String(after.length),
      magnitude:
        Math.abs(after.length - before.length) / Math.max(before.length, 1),
    });
  }

  const beforeFormal = formalityScore(before);
  const afterFormal = formalityScore(after);
  if (beforeFormal !== afterFormal) {
    metrics.push({
      category: "tone",
      beforeValue: String(beforeFormal),
      afterValue: String(afterFormal),
      magnitude: Math.abs(afterFormal - beforeFormal),
    });
    metrics.push({
      category: "politeness",
      beforeValue: String(beforeFormal),
      afterValue: String(afterFormal),
      magnitude: Math.abs(afterFormal - beforeFormal),
    });
  }

  // Character-level residual as formatting magnitude (normalized)
  const maxLen = Math.max(before.length, after.length, 1);
  let same = 0;
  const minLen = Math.min(before.length, after.length);
  for (let i = 0; i < minLen; i += 1) {
    if (before[i] === after[i]) same += 1;
  }
  const residual = 1 - same / maxLen;
  if (residual > 0.02 && metrics.length === 0) {
    metrics.push({
      category: "formatting",
      beforeValue: "baseline",
      afterValue: "revised",
      magnitude: residual,
    });
  }

  return metrics;
}

export function preferenceMatchScore(
  content: string,
  context: PersonalizationContext,
): number {
  let checks = 0;
  let hits = 0;

  if (context.writingStyle.verbosity === "short") {
    checks += 1;
    if (avgSentenceLength(content) <= 60) hits += 1;
  }
  if (context.writingStyle.bulletUsage === "prefer") {
    checks += 1;
    if (countBullets(content) >= 2) hits += 1;
  }
  if (context.writingStyle.headingDensity === "high") {
    checks += 1;
    if (countHeadings(content) >= 2) hits += 1;
  }
  if (
    context.writingStyle.tone === "polite" ||
    context.writingStyle.politeness === "high"
  ) {
    checks += 1;
    if (formalityScore(content) >= 2) hits += 1;
  }
  if (context.visualStyle.aspectRatio) {
    checks += 1;
    hits += 1; // enforced at generator options layer
  }
  if (context.visualStyle.colorPalette) {
    checks += 1;
    hits += 1; // enforced at generator options layer
  }

  if (checks === 0) return 1;
  return hits / checks;
}

export function computeDiffMetrics(input: {
  before: string;
  after: string;
  instructionLength: number;
  revisionCount: number;
  extraCategories?: Array<{
    category: DiffCategory;
    beforeValue: string;
    afterValue: string;
    magnitude: number;
  }>;
}): DiffMetrics {
  const categories = [
    ...classifyTextStructuralDiff(input.before, input.after),
    ...(input.extraCategories ?? []),
  ];
  const maxLen = Math.max(input.before.length, input.after.length, 1);
  let same = 0;
  const minLen = Math.min(input.before.length, input.after.length);
  for (let i = 0; i < minLen; i += 1) {
    if (input.before[i] === input.after[i]) same += 1;
  }
  const charRate = 1 - same / maxLen;
  const structural =
    categories.reduce((sum, c) => sum + Math.min(1, c.magnitude), 0) /
    Math.max(categories.length, 1);
  const normalizedDiffRate = Number(
    Math.min(1, charRate * 0.5 + structural * 0.5).toFixed(4),
  );

  return {
    normalizedDiffRate,
    categories,
    instructionLength: input.instructionLength,
    revisionCount: input.revisionCount,
  };
}

/** Excel structural signals from sheet JSON (not binary zip diff). */
export function excelStructureSignals(input: {
  headers: string[];
  freezePane?: boolean;
  autoFilter?: boolean;
  headerColor?: string;
}): Record<string, string> {
  return {
    columnOrder: input.headers.join("|"),
    freezePane: String(Boolean(input.freezePane)),
    autoFilter: String(Boolean(input.autoFilter)),
    headerColor: input.headerColor ?? "",
  };
}

/** PowerPoint structural signals. */
export function powerpointStructureSignals(input: {
  aspectRatio: string;
  primaryColor: string;
  slideCount: number;
}): Record<string, string> {
  return {
    aspectRatio: input.aspectRatio,
    primaryColor: input.primaryColor,
    slideCount: String(input.slideCount),
  };
}
