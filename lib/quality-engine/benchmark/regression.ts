import {
  REGRESSION_MIN_SAMPLES,
  REGRESSION_THRESHOLDS,
} from "@/lib/quality-engine/benchmark/config"
import type {
  BenchmarkRecord,
  MeasurableNumber,
  RegressionSignal,
} from "@/lib/quality-engine/benchmark/types"

function avg(values: Array<MeasurableNumber>): MeasurableNumber {
  const nums = values.filter((v): v is number => typeof v === "number")
  if (nums.length === 0) return null
  return nums.reduce((a, b) => a + b, 0) / nums.length
}

function rate(flags: boolean[]): MeasurableNumber {
  if (flags.length === 0) return null
  return flags.filter(Boolean).length / flags.length
}

/**
 * Detect quality regressions after version changes.
 * Never asserts when sample size is insufficient.
 */
export function detectQualityRegressions(
  records: readonly BenchmarkRecord[],
): RegressionSignal[] {
  const byType = new Map<string, BenchmarkRecord[]>()
  for (const r of records) {
    const list = byType.get(r.artifactType) ?? []
    list.push(r)
    byType.set(r.artifactType, list)
  }

  const signals: RegressionSignal[] = []

  for (const [artifactType, list] of byType) {
    if (list.length < REGRESSION_MIN_SAMPLES) {
      signals.push({
        artifactType,
        status: "insufficient_data",
        message: "データ不足",
        metrics: { samples: list.length },
      })
      continue
    }

    const sorted = [...list].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    )
    const mid = Math.floor(sorted.length / 2)
    const baseline = sorted.slice(0, mid)
    const recent = sorted.slice(mid)

    if (
      baseline.length < REGRESSION_MIN_SAMPLES ||
      recent.length < REGRESSION_MIN_SAMPLES
    ) {
      signals.push({
        artifactType,
        status: "insufficient_data",
        message: "データ不足（期間分割後）",
        metrics: {
          baseline: baseline.length,
          recent: recent.length,
        },
      })
      continue
    }

    const qBase = avg(baseline.map((r) => r.quality.qualityScore))
    const qRecent = avg(recent.map((r) => r.quality.qualityScore))
    const cBase = avg(
      baseline.map((r) => r.costInfo.estimatedCost ?? r.costInfo.totalApiCost),
    )
    const cRecent = avg(
      recent.map((r) => r.costInfo.estimatedCost ?? r.costInfo.totalApiCost),
    )
    const tBase = avg(baseline.map((r) => r.processing.processingTimeMs))
    const tRecent = avg(recent.map((r) => r.processing.processingTimeMs))
    const regenBase = rate(
      baseline.map((r) => Boolean(r.usageInfo.regenerated)),
    )
    const regenRecent = rate(
      recent.map((r) => Boolean(r.usageInfo.regenerated)),
    )

    const alerts: string[] = []
    if (
      qBase != null &&
      qRecent != null &&
      qBase - qRecent >= REGRESSION_THRESHOLDS.qualityDropPoints
    ) {
      alerts.push(
        `平均品質が${(qBase - qRecent).toFixed(1)}点低下`,
      )
    }
    if (
      cBase != null &&
      cRecent != null &&
      cBase > 0 &&
      (cRecent - cBase) / cBase >= REGRESSION_THRESHOLDS.costIncreaseRatio
    ) {
      alerts.push("原価が20%以上増加")
    }
    if (
      regenBase != null &&
      regenRecent != null &&
      regenRecent - regenBase >= REGRESSION_THRESHOLDS.regenerateRateIncrease
    ) {
      alerts.push("再生成率が10%以上増加")
    }
    if (
      tBase != null &&
      tRecent != null &&
      tBase > 0 &&
      (tRecent - tBase) / tBase >= REGRESSION_THRESHOLDS.durationIncreaseRatio
    ) {
      alerts.push("処理時間が30%以上増加")
    }

    if (alerts.length === 0) {
      signals.push({
        artifactType,
        status: "reference",
        message: "参考値: 有意な低下シグナルなし",
        metrics: {
          qualityBaseline: qBase,
          qualityRecent: qRecent,
          costBaseline: cBase,
          costRecent: cRecent,
        },
      })
    } else {
      signals.push({
        artifactType,
        status: "alert",
        message: alerts.join(" / "),
        metrics: {
          qualityBaseline: qBase,
          qualityRecent: qRecent,
          costBaseline: cBase,
          costRecent: cRecent,
          regenBaseline: regenBase,
          regenRecent: regenRecent,
        },
      })
    }
  }

  return signals
}
