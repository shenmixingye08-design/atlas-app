import { MIN_IMPROVEMENT_EVIDENCE } from "@/lib/artifact-feedback/constants"
import type {
  ArtifactFeedbackRecord,
  ArtifactFeedbackSummary,
} from "@/lib/artifact-feedback/types"

function avg(values: Array<number | null | undefined>): number | null {
  const nums = values.filter((v): v is number => typeof v === "number")
  if (!nums.length) return null
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 10) / 10
}

function rate(part: number, total: number): number | null {
  if (total <= 0) return null
  return Math.round((part / total) * 1000) / 10
}

export function buildArtifactFeedbackSummary(
  records: readonly ArtifactFeedbackRecord[],
  knownArtifactCount?: number | null,
): ArtifactFeedbackSummary {
  if (records.length === 0) {
    return {
      totalRatings: 0,
      positiveCount: 0,
      negativeCount: 0,
      positiveRate: null,
      negativeRate: null,
      ratedArtifactCount: 0,
      unratedArtifactCount:
        typeof knownArtifactCount === "number" ? knownArtifactCount : null,
      acceptedWithoutEditRate: null,
      regenerateRate: null,
      downloadRate: null,
      shareRate: null,
      avgQualityScore: null,
      avgApiCost: null,
      avgPositiveCost: null,
      avgNegativeCost: null,
      dataStatus: "insufficient_data",
    }
  }

  const positive = records.filter((r) => r.ratingType === "positive")
  const negative = records.filter((r) => r.ratingType === "negative")
  const artifactIds = new Set(records.map((r) => r.artifactId))
  const accepted = records.filter((r) =>
    r.positiveReasons.includes("そのまま使えた"),
  ).length
  const regen = records.filter((r) => (r.regenerationCount ?? 0) > 0).length
  const downloaded = records.filter((r) => r.downloaded === true).length
  const shared = records.filter((r) => r.shared === true).length

  return {
    totalRatings: records.length,
    positiveCount: positive.length,
    negativeCount: negative.length,
    positiveRate: rate(positive.length, records.length),
    negativeRate: rate(negative.length, records.length),
    ratedArtifactCount: artifactIds.size,
    unratedArtifactCount:
      typeof knownArtifactCount === "number"
        ? Math.max(0, knownArtifactCount - artifactIds.size)
        : null,
    acceptedWithoutEditRate: rate(accepted, records.length),
    regenerateRate: rate(regen, records.length),
    downloadRate: rate(downloaded, records.length),
    shareRate: rate(shared, records.length),
    avgQualityScore: avg(records.map((r) => r.qualityScore)),
    avgApiCost: avg(records.map((r) => r.totalApiCost)),
    avgPositiveCost: avg(positive.map((r) => r.totalApiCost)),
    avgNegativeCost: avg(negative.map((r) => r.totalApiCost)),
    dataStatus: "ok",
  }
}

export function rankReasons(
  records: readonly ArtifactFeedbackRecord[],
  kind: "positive" | "negative",
): Array<{ reason: string; count: number; rate: number | null }> {
  const counts = new Map<string, number>()
  const filtered = records.filter((r) => r.ratingType === kind)
  for (const r of filtered) {
    const reasons =
      kind === "positive" ? r.positiveReasons : r.negativeReasons
    for (const reason of reasons) {
      counts.set(reason, (counts.get(reason) ?? 0) + 1)
    }
  }
  return Array.from(counts.entries())
    .map(([reason, count]) => ({
      reason,
      count,
      rate: rate(count, filtered.length),
    }))
    .sort((a, b) => b.count - a.count)
}

export function groupPositiveRateBy(
  records: readonly ArtifactFeedbackRecord[],
  keyFn: (r: ArtifactFeedbackRecord) => string | null,
): Array<{ key: string; total: number; positiveRate: number | null }> {
  const groups = new Map<string, ArtifactFeedbackRecord[]>()
  for (const r of records) {
    const key = keyFn(r)
    if (!key) continue
    const list = groups.get(key) ?? []
    list.push(r)
    groups.set(key, list)
  }
  return Array.from(groups.entries())
    .map(([key, list]) => ({
      key,
      total: list.length,
      positiveRate:
        list.length < MIN_IMPROVEMENT_EVIDENCE
          ? null
          : rate(
              list.filter((r) => r.ratingType === "positive").length,
              list.length,
            ),
    }))
    .sort((a, b) => b.total - a.total)
}
