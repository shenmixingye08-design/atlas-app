import type {
  BenchmarkRecord,
  MeasurableNumber,
} from "@/lib/quality-engine/benchmark/types"

function avg(values: MeasurableNumber[]): MeasurableNumber {
  const nums = values.filter((v): v is number => typeof v === "number")
  if (!nums.length) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

function ratio(part: number, total: number): MeasurableNumber {
  if (total <= 0) return null
  return Math.round((part / total) * 1000) / 10
}

export type BenchmarkOverviewKpis = {
  sampleCount: number
  avgQualityScore: MeasurableNumber
  avgOwnerRating: MeasurableNumber
  avgUserRating: MeasurableNumber
  readyToUseRate: MeasurableNumber
  regenerateRate: MeasurableNumber
  downloadRate: MeasurableNumber
  avgApiCost: MeasurableNumber
  avgInputTokens: MeasurableNumber
  avgOutputTokens: MeasurableNumber
  avgProcessingTimeMs: MeasurableNumber
  avgImprovementCount: MeasurableNumber
  avgSmartContextReduction: MeasurableNumber
  failureRate: MeasurableNumber
  dataStatus: "ok" | "insufficient_data"
}

export type KindBenchmarkRow = {
  artifactType: string
  count: number
  avgQuality: MeasurableNumber
  avgCost: MeasurableNumber
  avgTimeMs: MeasurableNumber
  regenerateRate: MeasurableNumber
  avgOwnerRating: MeasurableNumber
  avgUserRating: MeasurableNumber
  noEditRate: MeasurableNumber
}

export function buildBenchmarkOverview(
  records: readonly BenchmarkRecord[],
): BenchmarkOverviewKpis {
  if (records.length === 0) {
    return {
      sampleCount: 0,
      avgQualityScore: null,
      avgOwnerRating: null,
      avgUserRating: null,
      readyToUseRate: null,
      regenerateRate: null,
      downloadRate: null,
      avgApiCost: null,
      avgInputTokens: null,
      avgOutputTokens: null,
      avgProcessingTimeMs: null,
      avgImprovementCount: null,
      avgSmartContextReduction: null,
      failureRate: null,
      dataStatus: "insufficient_data",
    }
  }

  const ready = records.filter(
    (r) =>
      r.ownerEvaluation?.usability === "ready" ||
      r.usageInfo.acceptedWithoutEdit === true,
  ).length
  const regen = records.filter(
    (r) => r.usageInfo.regenerated === true || (r.usageInfo.regenerationCount ?? 0) > 0,
  ).length
  const downloaded = records.filter((r) => r.usageInfo.downloaded === true).length
  const failed = records.filter((r) => r.status === "failed").length

  return {
    sampleCount: records.length,
    avgQualityScore: avg(records.map((r) => r.quality.qualityScore)),
    avgOwnerRating: avg(
      records.map((r) => r.usageInfo.ownerRating ?? r.ownerEvaluation?.overall ?? null),
    ),
    avgUserRating: avg(
      records.map((r) => r.usageInfo.userRating ?? r.userEvaluation?.score ?? null),
    ),
    readyToUseRate: ratio(ready, records.length),
    regenerateRate: ratio(regen, records.length),
    downloadRate: ratio(downloaded, records.length),
    avgApiCost: avg(
      records.map((r) => r.costInfo.estimatedCost ?? r.costInfo.totalApiCost),
    ),
    avgInputTokens: avg(
      records.map(
        (r) =>
          r.contextInfo.actualInputTokens ?? r.contextInfo.estimatedContextTokens,
      ),
    ),
    avgOutputTokens: avg(records.map((r) => r.contextInfo.outputTokens)),
    avgProcessingTimeMs: avg(records.map((r) => r.processing.processingTimeMs)),
    avgImprovementCount: avg(records.map((r) => r.processing.improvementCount)),
    avgSmartContextReduction: avg(
      records.map((r) => r.contextInfo.compressionRate),
    ),
    failureRate: ratio(failed, records.length),
    dataStatus: "ok",
  }
}

export function buildKindBenchmarkRows(
  records: readonly BenchmarkRecord[],
): KindBenchmarkRow[] {
  const byType = new Map<string, BenchmarkRecord[]>()
  for (const r of records) {
    const list = byType.get(r.artifactType) ?? []
    list.push(r)
    byType.set(r.artifactType, list)
  }
  return Array.from(byType.entries())
    .map(([artifactType, list]) => {
      const regen = list.filter(
        (r) =>
          r.usageInfo.regenerated === true ||
          (r.usageInfo.regenerationCount ?? 0) > 0,
      ).length
      const noEdit = list.filter(
        (r) => r.usageInfo.acceptedWithoutEdit === true,
      ).length
      return {
        artifactType,
        count: list.length,
        avgQuality: avg(list.map((r) => r.quality.qualityScore)),
        avgCost: avg(
          list.map((r) => r.costInfo.estimatedCost ?? r.costInfo.totalApiCost),
        ),
        avgTimeMs: avg(list.map((r) => r.processing.processingTimeMs)),
        regenerateRate: ratio(regen, list.length),
        avgOwnerRating: avg(
          list.map(
            (r) => r.usageInfo.ownerRating ?? r.ownerEvaluation?.overall ?? null,
          ),
        ),
        avgUserRating: avg(
          list.map(
            (r) => r.usageInfo.userRating ?? r.userEvaluation?.score ?? null,
          ),
        ),
        noEditRate: ratio(noEdit, list.length),
      }
    })
    .sort((a, b) => b.count - a.count)
}

/** Time-series from real records only — empty => データ不足 at UI. */
export function buildTrendSeries(
  records: readonly BenchmarkRecord[],
  field: "quality" | "cost" | "tokens" | "time",
): Array<{ at: string; value: MeasurableNumber }> {
  return [...records]
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((r) => {
      let value: MeasurableNumber = null
      if (field === "quality") value = r.quality.qualityScore
      if (field === "cost")
        value = r.costInfo.estimatedCost ?? r.costInfo.totalApiCost
      if (field === "tokens")
        value =
          r.contextInfo.actualInputTokens ?? r.contextInfo.estimatedContextTokens
      if (field === "time") value = r.processing.processingTimeMs
      return { at: r.createdAt, value }
    })
}
