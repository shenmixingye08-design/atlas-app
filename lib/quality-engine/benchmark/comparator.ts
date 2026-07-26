import type {
  AbComparison,
  BenchmarkRecord,
  MeasurableNumber,
} from "@/lib/quality-engine/benchmark/types"

function delta(
  a: MeasurableNumber,
  b: MeasurableNumber,
): MeasurableNumber {
  if (a == null || b == null) return null
  return Math.round((b - a) * 1000) / 1000
}

/**
 * Compare two records that share the same case / request fingerprint.
 * Does not invent Phase history — only uses recorded flags/versions.
 */
export function compareBenchmarkRecords(
  recordA: BenchmarkRecord,
  recordB: BenchmarkRecord,
): AbComparison {
  return {
    labelA: recordA.patternLabel ?? "A",
    labelB: recordB.patternLabel ?? "B",
    recordAId: recordA.id,
    recordBId: recordB.id,
    qualityScoreDelta: delta(
      recordA.quality.qualityScore,
      recordB.quality.qualityScore,
    ),
    apiCostDelta: delta(
      recordA.costInfo.totalApiCost ?? recordA.costInfo.estimatedCost,
      recordB.costInfo.totalApiCost ?? recordB.costInfo.estimatedCost,
    ),
    inputTokenDelta: delta(
      recordA.contextInfo.actualInputTokens ??
        recordA.contextInfo.estimatedContextTokens,
      recordB.contextInfo.actualInputTokens ??
        recordB.contextInfo.estimatedContextTokens,
    ),
    outputTokenDelta: delta(
      recordA.contextInfo.outputTokens,
      recordB.contextInfo.outputTokens,
    ),
    processingTimeDelta: delta(
      recordA.processing.processingTimeMs,
      recordB.processing.processingTimeMs,
    ),
    improvementCountDelta: delta(
      recordA.processing.improvementCount,
      recordB.processing.improvementCount,
    ),
    referenceCountDelta: delta(
      recordA.contextInfo.referenceCount,
      recordB.contextInfo.referenceCount,
    ),
    compressionRateDelta: delta(
      recordA.contextInfo.compressionRate,
      recordB.contextInfo.compressionRate,
    ),
    ownerRatingDelta: delta(
      recordA.usageInfo.ownerRating ?? recordA.ownerEvaluation?.overall ?? null,
      recordB.usageInfo.ownerRating ?? recordB.ownerEvaluation?.overall ?? null,
    ),
    notes: [
      `QE ${recordA.featureFlags.qualityEngine}→${recordB.featureFlags.qualityEngine}`,
      `SC ${recordA.featureFlags.smartContext}→${recordB.featureFlags.smartContext}`,
      `Know ${recordA.featureFlags.knowledge}→${recordB.featureFlags.knowledge}`,
      `ver ${recordA.versions.qualityEngineVersion} / ${recordB.versions.qualityEngineVersion}`,
    ].join(" · "),
  }
}

/** Pair records with same caseId and different smartContext flag. */
export function pairSmartContextAb(
  records: readonly BenchmarkRecord[],
): AbComparison[] {
  const byCase = new Map<string, BenchmarkRecord[]>()
  for (const r of records) {
    if (!r.caseId) continue
    const list = byCase.get(r.caseId) ?? []
    list.push(r)
    byCase.set(r.caseId, list)
  }
  const out: AbComparison[] = []
  for (const [, list] of byCase) {
    const off = list.find((r) => !r.featureFlags.smartContext)
    const on = list.find((r) => r.featureFlags.smartContext)
    if (off && on) out.push(compareBenchmarkRecords(off, on))
  }
  return out
}
