import type { SecretaryIntent } from "@/lib/secretary-intelligence/types"
import type { ResearchDecision } from "@/lib/secretary-intelligence/types"

const NEED_RESEARCH =
  /補助金|法令|法律|規制|市場|競合|トレンド|統計|最新|相場|金利|税率|制度|リサーチ|調査/i

const SKIP_RESEARCH =
  /会社理念|ブランドトーン|社内|自己紹介|お礼メール|署名|テンプレ/i

/** Decide whether web research is needed — no LLM. */
export function decideResearch(input: {
  assignment: string
  intent: SecretaryIntent
}): ResearchDecision {
  if (SKIP_RESEARCH.test(input.assignment) && !NEED_RESEARCH.test(input.assignment)) {
    return {
      needed: false,
      reason: "会社固有・定型の依頼のため Web 調査は不要",
      categories: [],
    }
  }

  if (NEED_RESEARCH.test(input.assignment)) {
    const categories: string[] = []
    if (/補助金|制度/.test(input.assignment)) categories.push("policy")
    if (/法令|法律|規制/.test(input.assignment)) categories.push("legal")
    if (/市場|競合|トレンド|統計/.test(input.assignment)) categories.push("market")
    if (categories.length === 0) categories.push("web_research")
    return {
      needed: true,
      reason: "外部の最新情報・制度・市場情報が品質に影響するため",
      categories,
    }
  }

  // Sales / company intro without research keywords → skip
  if (
    input.intent.purpose === "営業" ||
    input.intent.purpose === "コミュニケーション" ||
    input.intent.purpose === "SNS発信"
  ) {
    return {
      needed: false,
      reason: "会社情報・既存 Knowledge で十分なタイプの依頼",
      categories: [],
    }
  }

  return {
    needed: false,
    reason: "調査キーワードなし",
    categories: [],
  }
}
