import {
  listBenchmarkRecords,
  updateBenchmarkRecord,
  type UserEvaluation,
} from "@/lib/quality-engine/benchmark"
import type { ArtifactFeedbackRecord } from "@/lib/artifact-feedback/types"

function toUserEvaluation(record: ArtifactFeedbackRecord): UserEvaluation {
  const isPositive = record.ratingType === "positive"
  return {
    label: isPositive ? "very_good" : "needs_improvement",
    score: isPositive ? 100 : 30,
    reasons:
      record.ratingType === "positive"
        ? record.positiveReasons
        : record.negativeReasons,
    otherText: record.comment,
    ratedAt: record.updatedAt,
    ratingType: record.ratingType,
    positiveReasons: record.positiveReasons,
    negativeReasons: record.negativeReasons,
  }
}

/**
 * Link user thumbs feedback onto matching Benchmark records.
 * Does not invent records; only patches existing matches.
 */
export function syncFeedbackToBenchmark(
  record: ArtifactFeedbackRecord,
): number {
  const evaluation = toUserEvaluation(record)
  const acceptedWithoutEdit = record.positiveReasons.includes("そのまま使えた")
  let updated = 0
  for (const bench of listBenchmarkRecords(500)) {
    if (bench.artifactId !== record.artifactId) continue
    if (bench.userId && bench.userId !== record.userId) continue
    updateBenchmarkRecord(bench.id, {
      userEvaluation: evaluation,
      usageInfo: {
        ...bench.usageInfo,
        userRating: evaluation.score,
        userFeedback: record.comment,
        positiveReasons: record.positiveReasons,
        negativeReasons: record.negativeReasons,
        acceptedWithoutEdit:
          record.ratingType === "positive" ? acceptedWithoutEdit : false,
        finalUsed:
          record.finalUsed !== null
            ? record.finalUsed
            : bench.usageInfo.finalUsed,
      },
    })
    updated += 1
  }
  return updated
}

export function clearFeedbackFromBenchmark(
  artifactId: string,
  userId: string,
): number {
  let updated = 0
  for (const bench of listBenchmarkRecords(500)) {
    if (bench.artifactId !== artifactId) continue
    if (bench.userId && bench.userId !== userId) continue
    updateBenchmarkRecord(bench.id, {
      userEvaluation: null,
      usageInfo: {
        ...bench.usageInfo,
        userRating: null,
        userFeedback: null,
        positiveReasons: null,
        negativeReasons: null,
        acceptedWithoutEdit: null,
      },
    })
    updated += 1
  }
  return updated
}
