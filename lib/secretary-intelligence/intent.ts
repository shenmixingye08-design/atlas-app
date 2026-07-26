import { classifyDeliverableType } from "@/lib/orchestration/deliverable-classification"
import type { DeliverableType } from "@/lib/orchestration/deliverable-types"
import { resolveQualityPromptKind } from "@/lib/quality-engine/policy"
import type { QualityPromptKind } from "@/lib/quality-engine/types"
import type { SecretaryIntent } from "@/lib/secretary-intelligence/types"

const PURPOSE_RULES: Array<{ re: RegExp; purpose: string }> = [
  { re: /営業|提案|地主|地権者|セールス|pitch/i, purpose: "営業" },
  { re: /契約|NDA|秘密保持|利用規約/i, purpose: "契約・法務" },
  { re: /ブログ|SEO|記事|オウンド/i, purpose: "コンテンツ発信" },
  { re: /メール|返信|お礼|催促|日程/i, purpose: "コミュニケーション" },
  { re: /投稿|SNS|ツイート|Xに/i, purpose: "SNS発信" },
  { re: /調査|リサーチ|市場|競合/i, purpose: "調査・分析" },
  { re: /見積|請求|領収|家計|売上集計|Excel|表/i, purpose: "数値・事務" },
  { re: /報告|議事録|案内/i, purpose: "社内・文書" },
]

const AUDIENCE_RULES: Array<{ re: RegExp; audience: string }> = [
  { re: /地主|地権者/i, audience: "地主・地権者" },
  { re: /法人|企業|決裁|B2B/i, audience: "法人・決裁者" },
  { re: /顧客|お客様|エンドユーザー/i, audience: "顧客" },
  { re: /上司|社内|チーム/i, audience: "社内" },
  { re: /投資家|株主/i, audience: "投資家" },
]

const ARTIFACT_HINT: Partial<Record<DeliverableType, string>> = {
  presentation: "提案書・営業資料",
  proposal: "提案書",
  blog: "ブログ記事",
  email: "メール",
  social_post: "SNS投稿",
  document: "文書",
  report: "報告書",
  research: "調査レポート",
  short_document: "短文ドキュメント",
}

function extractDeadline(text: string): string | null {
  const m = text.match(
    /(\d{4}[-/年]\d{1,2}[-/月]\d{1,2}日?|今日中|明日|今週中|金曜まで|至急|ASAP)/i,
  )
  return m?.[1] ?? null
}

function extractPriority(
  text: string,
): SecretaryIntent["priority"] {
  if (/至急|緊急|ASAP|今すぐ/i.test(text)) return "urgent"
  if (/優先|早めに|急ぎ/i.test(text)) return "high"
  if (/余裕|いつでも|低優先/i.test(text)) return "low"
  return "normal"
}

function purposeOf(text: string, type: DeliverableType): string {
  for (const rule of PURPOSE_RULES) {
    if (rule.re.test(text)) return rule.purpose
  }
  if (type === "presentation" || type === "proposal") return "営業"
  if (type === "blog") return "コンテンツ発信"
  if (type === "email") return "コミュニケーション"
  if (type === "social_post") return "SNS発信"
  return "成果物作成"
}

function audienceOf(text: string): string | null {
  for (const rule of AUDIENCE_RULES) {
    if (rule.re.test(text)) return rule.audience
  }
  return null
}

function requiredActions(text: string, type: DeliverableType): string[] {
  const actions: string[] = ["成果物作成"]
  if (/送信|送って/i.test(text)) actions.push("送信")
  if (/投稿|公開/i.test(text)) actions.push("公開・投稿")
  if (/調査|リサーチ/i.test(text)) actions.push("調査")
  if (type === "presentation" || type === "proposal") actions.push("構成設計")
  if (/契約/i.test(text)) actions.push("条項整理")
  return Array.from(new Set(actions))
}

/** Rule-based intent extraction — no LLM. */
export function analyzeIntent(assignment: string): SecretaryIntent {
  const deliverableType = classifyDeliverableType(assignment)
  const promptKind: QualityPromptKind = resolveQualityPromptKind({
    assignment,
    deliverableType,
    metadata: {},
  })
  const purpose = purposeOf(assignment, deliverableType)
  const audience = audienceOf(assignment)
  const trueGoal = [
    purpose,
    audience ? `${audience}向け` : null,
    ARTIFACT_HINT[deliverableType] ?? deliverableType,
  ]
    .filter(Boolean)
    .join(" / ")

  return {
    purpose,
    artifactHint: ARTIFACT_HINT[deliverableType] ?? deliverableType,
    deliverableType,
    promptKind,
    audience,
    deadline: extractDeadline(assignment),
    priority: extractPriority(assignment),
    requiredActions: requiredActions(assignment, deliverableType),
    trueGoal,
  }
}
