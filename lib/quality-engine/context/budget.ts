import { estimateTokens } from "@/lib/ai/cost-meter"
import {
  getContextTokenBudget,
  getPastArtifactCap,
  MIN_RELEVANCE_SCORE,
} from "@/lib/quality-engine/context/config"
import type { ScoredKnowledgeCandidate } from "@/lib/quality-engine/context/types"
import type { QualityPromptKind } from "@/lib/quality-engine/types"

function fingerprintBody(body: string): string {
  return body
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 240)
}

/**
 * Apply token budget: keep required + highest scores, drop duplicates / low relevance.
 * Deterministic: stable sort by score desc, then id asc.
 */
export function applyContextBudget(input: {
  scored: readonly ScoredKnowledgeCandidate[]
  promptKind: QualityPromptKind
}): ScoredKnowledgeCandidate[] {
  const budget = getContextTokenBudget(input.promptKind)
  const pastCap = getPastArtifactCap(input.promptKind)
  const working = input.scored.map((s) => ({
    ...s,
    reasons: [...s.reasons],
    exclusionReasons: [...s.exclusionReasons],
  }))

  // Stable sort
  working.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.entry.id.localeCompare(b.entry.id)
  })

  const seenBodies = new Set<string>()
  let pastCount = 0
  let usedTokens = 0

  for (const item of working) {
    if (item.exclusionReasons.includes("disabled")) {
      item.selected = false
      continue
    }
    if (
      item.exclusionReasons.includes("artifact_type_mismatch") &&
      !item.required
    ) {
      item.selected = false
      continue
    }

    const fp = fingerprintBody(item.entry.body)
    if (fp && seenBodies.has(fp) && !item.required) {
      item.selected = false
      if (!item.exclusionReasons.includes("duplicate")) {
        item.exclusionReasons.push("duplicate")
      }
      continue
    }

    if (item.entry.layer === "past_deliverables") {
      if (pastCount >= pastCap && !item.required) {
        item.selected = false
        if (!item.exclusionReasons.includes("past_artifact_cap")) {
          item.exclusionReasons.push("past_artifact_cap")
        }
        continue
      }
    }

    if (
      !item.required &&
      item.score < MIN_RELEVANCE_SCORE &&
      !item.exclusionReasons.includes("stale")
    ) {
      item.selected = false
      if (!item.exclusionReasons.includes("low_relevance")) {
        item.exclusionReasons.push("low_relevance")
      }
      continue
    }

    if (
      !item.required &&
      item.exclusionReasons.includes("stale") &&
      item.score < MIN_RELEVANCE_SCORE + 10
    ) {
      item.selected = false
      continue
    }

    const tokens = Math.max(
      1,
      item.estimatedTokens || estimateTokens(item.entry.body),
    )

    if (!item.required && usedTokens + tokens > budget) {
      item.selected = false
      if (!item.exclusionReasons.includes("budget_exceeded")) {
        item.exclusionReasons.push("budget_exceeded")
      }
      continue
    }

    // Required always kept even if over budget
    item.selected = true
    if (!item.reasons.includes("budget_selected")) {
      item.reasons.push("budget_selected")
    }
    usedTokens += tokens
    if (fp) seenBodies.add(fp)
    if (item.entry.layer === "past_deliverables") pastCount += 1
  }

  // Restore original candidate order for determinism in output lists
  const byId = new Map(working.map((w) => [w.entry.id, w]))
  return input.scored.map((s) => byId.get(s.entry.id) ?? s)
}

export function sumSelectedTokens(
  scored: readonly ScoredKnowledgeCandidate[],
): number {
  return scored
    .filter((s) => s.selected)
    .reduce(
      (acc, s) =>
        acc + Math.max(1, s.estimatedTokens || estimateTokens(s.entry.body)),
      0,
    )
}
