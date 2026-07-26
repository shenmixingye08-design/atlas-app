import type {
  MissingInfoItem,
  SecretaryAutonomyLevel,
  SecretaryQuestion,
} from "@/lib/secretary-intelligence/types"
import { unresolvedMissing } from "@/lib/secretary-intelligence/missing-info"

const PROMPT_BY_ID: Record<string, string> = {
  service: "扱うサービスや商品内容を教えてください",
  pages: "おおよそのページ数（または分量）を教えてください",
  use_case: "どのような場面で使いますか（初回訪問、提案会など）",
  audience: "主な対象者を教えてください",
  party: "契約の相手方を教えてください",
  term: "契約期間を教えてください",
  amount: "金額（報酬・賃料など）を教えてください",
  recipient: "宛先との関係性を教えてください",
  purpose: "メールの目的を教えてください",
  topic: "テーマやキーワードを教えてください",
  columns: "必要な列・項目を教えてください",
}

/**
 * Generate minimal questions only for unresolved gaps.
 * Level 3–4: ask critical only (or none if generateable).
 * Level 1: ask critical + up to 2 non-critical.
 * Level 2: ask critical only.
 */
export function generateQuestions(input: {
  missing: readonly MissingInfoItem[]
  autonomyLevel: SecretaryAutonomyLevel
}): SecretaryQuestion[] {
  const open = unresolvedMissing(input.missing)
  if (open.length === 0) return []

  const critical = open.filter((m) => m.critical)
  const nonCritical = open.filter((m) => !m.critical)

  let selected: MissingInfoItem[] = []
  if (input.autonomyLevel === 1) {
    selected = [...critical, ...nonCritical.slice(0, 2)]
  } else if (input.autonomyLevel === 2) {
    selected = critical
  } else if (input.autonomyLevel === 3) {
    // Proceed if only soft gaps; ask only when multiple critical
    selected = critical.length >= 2 ? critical.slice(0, 2) : []
  } else {
    // Level 4: never block on questions
    selected = []
  }

  return selected.map((m) => ({
    id: `q_${m.id}`,
    prompt: PROMPT_BY_ID[m.id] ?? `${m.label}を教えてください`,
    relatedMissingId: m.id,
  }))
}
