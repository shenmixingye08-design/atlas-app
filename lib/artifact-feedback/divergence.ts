import {
  DIVERGENCE_HIGH_SCORE,
  DIVERGENCE_LOW_SCORE,
} from "@/lib/artifact-feedback/constants"
import type {
  ArtifactFeedbackRecord,
  FeedbackDivergenceWarning,
} from "@/lib/artifact-feedback/types"

/** Quality Score とユーザー評価の乖離を検出（架空データなし） */
export function detectQualityUserDivergence(
  records: readonly ArtifactFeedbackRecord[],
): FeedbackDivergenceWarning[] {
  const out: FeedbackDivergenceWarning[] = []
  for (const r of records) {
    if (r.qualityScore == null) continue
    if (
      r.qualityScore >= DIVERGENCE_HIGH_SCORE &&
      r.ratingType === "negative"
    ) {
      out.push({
        artifactId: r.artifactId,
        qualityScore: r.qualityScore,
        ratingType: r.ratingType,
        message: "AI評価とユーザー評価に乖離があります",
      })
    }
    if (
      r.qualityScore <= DIVERGENCE_LOW_SCORE &&
      r.ratingType === "positive"
    ) {
      out.push({
        artifactId: r.artifactId,
        qualityScore: r.qualityScore,
        ratingType: r.ratingType,
        message: "Quality Scoreが低いのに高評価です（確認対象）",
      })
    }
  }
  return out
}
