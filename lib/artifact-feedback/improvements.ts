import { MIN_IMPROVEMENT_EVIDENCE } from "@/lib/artifact-feedback/constants"
import type {
  ArtifactFeedbackRecord,
  FeedbackImprovementCandidate,
} from "@/lib/artifact-feedback/types"

type Bucket = {
  key: string
  total: number
  negative: number
  positive: number
  reasonCounts: Map<string, number>
  costSum: number
  costN: number
  regenSum: number
}

function bucketize(
  records: readonly ArtifactFeedbackRecord[],
  keyFn: (r: ArtifactFeedbackRecord) => string | null,
): Map<string, Bucket> {
  const map = new Map<string, Bucket>()
  for (const r of records) {
    const key = keyFn(r)
    if (!key) continue
    const b = map.get(key) ?? {
      key,
      total: 0,
      negative: 0,
      positive: 0,
      reasonCounts: new Map(),
      costSum: 0,
      costN: 0,
      regenSum: 0,
    }
    b.total += 1
    if (r.ratingType === "negative") b.negative += 1
    else b.positive += 1
    for (const reason of r.negativeReasons) {
      b.reasonCounts.set(reason, (b.reasonCounts.get(reason) ?? 0) + 1)
    }
    if (r.totalApiCost != null) {
      b.costSum += r.totalApiCost
      b.costN += 1
    }
    b.regenSum += r.regenerationCount ?? 0
    map.set(key, b)
  }
  return map
}

function candidate(
  id: string,
  message: string,
  evidenceCount: number,
  evidenceRate: number,
  total: number,
): FeedbackImprovementCandidate {
  return {
    id,
    message,
    evidenceCount,
    evidenceRate,
    status: total < MIN_IMPROVEMENT_EVIDENCE ? "reference" : "alert",
  }
}

/**
 * ルールベース改善候補。十分な件数がない場合は出さない／参考値明示。
 * Prompt/Knowledge の自動変更はしない。
 */
export function buildImprovementCandidates(
  records: readonly ArtifactFeedbackRecord[],
): FeedbackImprovementCandidate[] {
  const out: FeedbackImprovementCandidate[] = []

  const byType = bucketize(records, (r) => r.artifactType)
  for (const b of byType.values()) {
    if (b.total < 3) continue
    const topReason = [...b.reasonCounts.entries()].sort(
      (a, c) => c[1] - a[1],
    )[0]
    if (topReason && topReason[1] >= 2) {
      out.push(
        candidate(
          `type-reason:${b.key}:${topReason[0]}`,
          `${b.key}で「${topReason[0]}」が多い`,
          topReason[1],
          Math.round((topReason[1] / b.total) * 1000) / 10,
          b.total,
        ),
      )
    }
    const regenRate = b.regenSum / b.total
    if (regenRate >= 0.4) {
      out.push(
        candidate(
          `type-regen:${b.key}`,
          `${b.key}で再生成率が高い`,
          b.total,
          Math.round(regenRate * 1000) / 10,
          b.total,
        ),
      )
    }
    const negRate = b.negative / b.total
    if (negRate >= 0.5 && b.costN >= 3) {
      const avgCost = b.costSum / b.costN
      if (avgCost >= 0.05) {
        out.push(
          candidate(
            `type-cost-neg:${b.key}`,
            `${b.key}でAPI原価が高いのに評価が低い`,
            b.negative,
            Math.round(negRate * 1000) / 10,
            b.total,
          ),
        )
      }
    }
  }

  const byPrompt = bucketize(records, (r) => r.promptVersion)
  for (const b of byPrompt.values()) {
    if (b.total < 3) continue
    const negRate = b.negative / b.total
    if (negRate >= 0.45) {
      out.push(
        candidate(
          `prompt-neg:${b.key}`,
          `Prompt Version ${b.key}で低評価率が上昇`,
          b.negative,
          Math.round(negRate * 1000) / 10,
          b.total,
        ),
      )
    }
  }

  const byTemplate = bucketize(
    records,
    (r) => r.templateId ?? r.templateVersion,
  )
  for (const b of byTemplate.values()) {
    if (b.total < 3) continue
    const posRate = b.positive / b.total
    if (posRate >= 0.7) {
      out.push(
        candidate(
          `template-pos:${b.key}`,
          `Template ${b.key}で高評価率が高い`,
          b.positive,
          Math.round(posRate * 1000) / 10,
          b.total,
        ),
      )
    }
  }

  const byKnowledge = bucketize(records, (r) => r.knowledgeVersion)
  for (const b of byKnowledge.values()) {
    if (b.total < 3) continue
    const expertise = b.reasonCounts.get("専門性が足りない") ?? 0
    if (expertise === 0 && b.positive / b.total >= 0.6) {
      out.push(
        candidate(
          `knowledge-expertise:${b.key}`,
          `Knowledge Version ${b.key}で専門性不足が減少`,
          b.total,
          Math.round((b.positive / b.total) * 1000) / 10,
          b.total,
        ),
      )
    }
  }

  return out.slice(0, 40)
}
