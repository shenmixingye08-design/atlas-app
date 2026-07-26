import type { KnowledgeLayerId } from "@/lib/quality-engine/knowledge/types"
import type { ScoredKnowledgeCandidate } from "@/lib/quality-engine/context/types"

/**
 * Conflict priority (higher wins):
 * 1 user instruction
 * 2 legal/safety/required rules
 * 3 business profile
 * 4 reference
 * 5 brand
 * 6 deliverable rules
 * 7 template
 * 8 past deliverables
 * 9 general knowledge
 */
const LAYER_RANK: Record<KnowledgeLayerId, number> = {
  user_instruction: 100,
  rules: 90,
  business_profile: 80,
  reference: 70,
  brand: 60,
  deliverable: 55,
  template: 50,
  company: 45,
  industry: 40,
  design: 35,
  vision: 30,
  user_settings: 25,
  past_deliverables: 20,
}

function topicKey(text: string): string | null {
  const t = text.trim()
  if (!t) return null
  // Detect competing directives about tone/language/format/cta/etc.
  const m = t.match(
    /(トーン|文体|口調|言語|language|出力形式|フォーマット|cta|禁止|読者|audience|ページ数|構成)[^\n]{0,40}/i,
  )
  if (!m) return null
  return m[1].toLowerCase()
}

/**
 * Drop losing conflicting instructions so Writer never sees contradictions.
 * Deterministic: keep highest-rank layer, then higher score, then id.
 */
export function resolveContextConflicts(
  scored: readonly ScoredKnowledgeCandidate[],
): ScoredKnowledgeCandidate[] {
  const selected = scored.filter((s) => s.selected)
  const losers = new Set<string>()
  const byTopic = new Map<string, ScoredKnowledgeCandidate[]>()

  for (const item of selected) {
    const key = topicKey(`${item.entry.title}\n${item.entry.body}`)
    if (!key) continue
    const list = byTopic.get(key) ?? []
    list.push(item)
    byTopic.set(key, list)
  }

  for (const [, group] of byTopic) {
    if (group.length < 2) continue
    const ranked = [...group].sort((a, b) => {
      const ra = LAYER_RANK[a.entry.layer] ?? 0
      const rb = LAYER_RANK[b.entry.layer] ?? 0
      if (rb !== ra) return rb - ra
      if (b.score !== a.score) return b.score - a.score
      return a.entry.id.localeCompare(b.entry.id)
    })
    const winner = ranked[0]
    for (const loser of ranked.slice(1)) {
      // Never drop required user instruction / legal required against each other lightly:
      // if both required and different layers, keep both unless exact duplicate topic body.
      if (loser.required && winner.required && loser.entry.layer !== winner.entry.layer) {
        continue
      }
      losers.add(loser.entry.id)
    }
  }

  return scored.map((s) => {
    if (!losers.has(s.entry.id)) {
      if (s.selected && !s.reasons.includes("conflict_winner")) {
        // mark winners that participated in a conflict group
        const key = topicKey(`${s.entry.title}\n${s.entry.body}`)
        if (key && (byTopic.get(key)?.length ?? 0) > 1) {
          return {
            ...s,
            reasons: [...s.reasons, "conflict_winner"],
          }
        }
      }
      return s
    }
    return {
      ...s,
      selected: false,
      exclusionReasons: Array.from(
        new Set([...s.exclusionReasons, "conflict_loser" as const]),
      ),
    }
  })
}
