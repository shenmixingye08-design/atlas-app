import type {
  BenchmarkRecord,
  ImprovementPriorityRow,
  MeasurableNumber,
} from "@/lib/quality-engine/benchmark/types"

function median(values: number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid]
}

function quadrant(
  quality: MeasurableNumber,
  cost: MeasurableNumber,
  qMedian: number | null,
  cMedian: number | null,
): ImprovementPriorityRow["quadrant"] {
  const highQ = quality != null && qMedian != null ? quality >= qMedian : false
  const highC = cost != null && cMedian != null ? cost >= cMedian : false
  if (highQ && !highC) return "high_q_low_c"
  if (highQ && highC) return "high_q_high_c"
  if (!highQ && !highC) return "low_q_low_c"
  return "low_q_high_c"
}

/** Rule-based improvement priority — no LLM, no fake scores. */
export function rankImprovementPriority(
  records: readonly BenchmarkRecord[],
): ImprovementPriorityRow[] {
  const qualities = records
    .map((r) => r.quality.qualityScore)
    .filter((v): v is number => v != null)
  const costs = records
    .map((r) => r.costInfo.estimatedCost ?? r.costInfo.totalApiCost)
    .filter((v): v is number => v != null)
  const qMedian = median(qualities)
  const cMedian = median(costs)

  return records
    .map((r) => {
      const quality = r.quality.qualityScore
      const cost = r.costInfo.estimatedCost ?? r.costInfo.totalApiCost
      const q = quadrant(quality, cost, qMedian, cMedian)
      const reasons: string[] = []
      let score = 0

      if (q === "low_q_high_c") {
        score += 40
        reasons.push("低品質・高コスト")
      }
      if ((r.usageInfo.regenerationCount ?? 0) > 0 || r.usageInfo.regenerated) {
        score += 15
        reasons.push("再生成率が高い")
      }
      if ((r.usageInfo.ownerRating ?? r.ownerEvaluation?.overall ?? 100) < 60) {
        score += 15
        reasons.push("Owner評価が低い")
      }
      if (
        (r.contextInfo.estimatedContextTokens ?? 0) > 4_000 &&
        (quality ?? 100) < 80
      ) {
        score += 12
        reasons.push("Contextが多いのに品質が低い")
      }
      if ((r.processing.reviewerCalls ?? 0) >= 2) {
        score += 8
        reasons.push("Reviewer回数が多い")
      }
      if (
        (r.processing.improvementCount ?? 0) >= 1 &&
        (quality ?? 100) < 80
      ) {
        score += 10
        reasons.push("改善しても点数が上がらない")
      }

      return {
        recordId: r.id,
        artifactType: r.artifactType,
        title: r.title,
        priorityScore: score,
        reasons,
        quadrant: q,
      }
    })
    .sort((a, b) => b.priorityScore - a.priorityScore)
}
