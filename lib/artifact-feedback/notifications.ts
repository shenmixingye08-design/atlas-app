import { DIVERGENCE_HIGH_SCORE } from "@/lib/artifact-feedback/constants"
import type { ArtifactFeedbackRecord } from "@/lib/artifact-feedback/types"

export type ArtifactFeedbackOwnerNotice = {
  id: string
  severity: "warning" | "info"
  message: string
  artifactType: string | null
  count: number
}

const LEGAL_TYPES = ["contract", "legal", "契約", "法務"]

/**
 * Owner-only notification candidates derived from real feedback.
 * Never shown to end users.
 */
export function buildOwnerFeedbackNotices(
  records: readonly ArtifactFeedbackRecord[],
): ArtifactFeedbackOwnerNotice[] {
  const notices: ArtifactFeedbackOwnerNotice[] = []
  if (records.length === 0) return notices

  const byType = new Map<string, ArtifactFeedbackRecord[]>()
  for (const r of records) {
    const key = r.artifactType ?? "unknown"
    const list = byType.get(key) ?? []
    list.push(r)
    byType.set(key, list)
  }

  for (const [type, list] of byType) {
    const sorted = [...list].sort((a, b) =>
      b.updatedAt.localeCompare(a.updatedAt),
    )
    let streak = 0
    for (const r of sorted) {
      if (r.ratingType === "negative") streak += 1
      else break
    }
    if (streak >= 3) {
      notices.push({
        id: `streak-neg:${type}`,
        severity: "warning",
        message: `${type}で低評価が連続しています`,
        artifactType: type,
        count: streak,
      })
    }
  }

  const factErrors = records.filter(
    (r) =>
      r.ratingType === "negative" &&
      r.negativeReasons.includes("情報が間違っている"),
  )
  if (factErrors.length > 0) {
    notices.push({
      id: "fact-error",
      severity: "warning",
      message: "情報誤りの報告があります",
      artifactType: null,
      count: factErrors.length,
    })
  }

  const legalNeg = records.filter(
    (r) =>
      r.ratingType === "negative" &&
      LEGAL_TYPES.some((t) =>
        (r.artifactType ?? "").toLowerCase().includes(t.toLowerCase()),
      ),
  )
  if (legalNeg.length > 0) {
    notices.push({
      id: "legal-neg",
      severity: "warning",
      message: "契約書・法務成果物への低評価があります",
      artifactType: null,
      count: legalNeg.length,
    })
  }

  const costlyNeg = records.filter(
    (r) =>
      r.ratingType === "negative" &&
      r.totalApiCost != null &&
      r.totalApiCost >= 0.1,
  )
  if (costlyNeg.length > 0) {
    notices.push({
      id: "costly-neg",
      severity: "warning",
      message: "API原価が高い成果物への低評価があります",
      artifactType: null,
      count: costlyNeg.length,
    })
  }

  const highScoreNeg = records.filter(
    (r) =>
      r.ratingType === "negative" &&
      r.qualityScore != null &&
      r.qualityScore >= DIVERGENCE_HIGH_SCORE,
  )
  if (highScoreNeg.length > 0) {
    notices.push({
      id: "high-score-neg",
      severity: "warning",
      message: "Quality Score 90以上なのに低評価があります",
      artifactType: null,
      count: highScoreNeg.length,
    })
  }

  const byPrompt = new Map<string, ArtifactFeedbackRecord[]>()
  for (const r of records) {
    if (!r.promptVersion) continue
    const list = byPrompt.get(r.promptVersion) ?? []
    list.push(r)
    byPrompt.set(r.promptVersion, list)
  }
  for (const [prompt, list] of byPrompt) {
    if (list.length < 4) continue
    const sorted = [...list].sort((a, b) =>
      a.updatedAt.localeCompare(b.updatedAt),
    )
    const mid = Math.floor(sorted.length / 2)
    const early = sorted.slice(0, mid)
    const late = sorted.slice(mid)
    const earlyNeg =
      early.filter((r) => r.ratingType === "negative").length /
      Math.max(early.length, 1)
    const lateNeg =
      late.filter((r) => r.ratingType === "negative").length /
      Math.max(late.length, 1)
    if (lateNeg - earlyNeg >= 0.2 && lateNeg >= 0.4) {
      notices.push({
        id: `prompt-rise:${prompt}`,
        severity: "warning",
        message: `Prompt Version ${prompt}で低評価が増加しています`,
        artifactType: null,
        count: late.filter((r) => r.ratingType === "negative").length,
      })
    }
  }

  return notices
}
