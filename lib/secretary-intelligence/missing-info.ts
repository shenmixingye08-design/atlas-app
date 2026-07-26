import type { QualityPromptKind } from "@/lib/quality-engine/types"
import type { MissingInfoItem } from "@/lib/secretary-intelligence/types"

type Requirement = {
  id: string
  label: string
  critical: boolean
  present: RegExp
}

const BY_KIND: Partial<Record<QualityPromptKind, Requirement[]>> = {
  sales_material: [
    {
      id: "service",
      label: "サービス・商品内容",
      critical: false,
      present: /サービス|商品|太陽光|SaaS|提案内容/,
    },
    {
      id: "pages",
      label: "ページ数・分量",
      critical: false,
      present: /\d+\s*ページ|枚|スライド/,
    },
    {
      id: "use_case",
      label: "用途・利用シーン",
      critical: false,
      present: /用途|向け|初回|提案会|説明/,
    },
    {
      id: "audience",
      label: "対象者",
      critical: true,
      present: /地主|地権者|法人|顧客|向け/,
    },
  ],
  proposal: [
    {
      id: "audience",
      label: "対象者",
      critical: true,
      present: /向け|顧客|法人/,
    },
    {
      id: "service",
      label: "提案内容",
      critical: false,
      present: /サービス|提案|導入/,
    },
  ],
  contract: [
    {
      id: "party",
      label: "契約相手",
      critical: true,
      present: /甲|乙|株式会社|合同会社|相手方|取引先/,
    },
    {
      id: "term",
      label: "契約期間",
      critical: true,
      present: /期間|から.*まで|\d+\s*年|\d+\s*ヶ月|契約期間/,
    },
    {
      id: "amount",
      label: "金額",
      critical: true,
      present: /\d+\s*円|万円|金額|報酬|賃料/,
    },
  ],
  email: [
    {
      id: "recipient",
      label: "宛先・関係性",
      critical: false,
      present: /様|宛|お客様|先方/,
    },
    {
      id: "purpose",
      label: "メールの目的",
      critical: false,
      present: /お礼|催促|案内|日程|お願い|確認/,
    },
  ],
  blog: [
    {
      id: "topic",
      label: "テーマ",
      critical: true,
      present: /について|テーマ|SEO|解説|事例/,
    },
  ],
  excel: [
    {
      id: "columns",
      label: "列・項目",
      critical: false,
      present: /列|項目|管理|集計/,
    },
  ],
  sns: [
    {
      id: "topic",
      label: "投稿テーマ",
      critical: false,
      present: /告知|発売|キャンペーン|お知らせ/,
    },
  ],
}

function memoryCovers(label: string, knownFacts: readonly string[]): boolean {
  const hay = knownFacts.join("\n").toLowerCase()
  if (!hay.trim()) return false
  const tokens = label.split(/[・\/]/).filter((t) => t.length >= 2)
  return tokens.some((t) => hay.includes(t.toLowerCase()))
}

/**
 * Extract missing information — no LLM.
 * Items resolved via assignment or memory are marked resolvedFromMemory / omitted from open gaps.
 */
export function checkMissingInformation(input: {
  assignment: string
  promptKind: QualityPromptKind
  knownFacts?: readonly string[]
  hasBusinessProfile?: boolean
}): MissingInfoItem[] {
  const reqs = BY_KIND[input.promptKind] ?? []
  const known = input.knownFacts ?? []
  const open: MissingInfoItem[] = []

  for (const req of reqs) {
    const inAssignment = req.present.test(input.assignment)
    const inMemory =
      memoryCovers(req.label, known) ||
      (req.id === "service" && Boolean(input.hasBusinessProfile))

    if (inAssignment) continue

    if (inMemory) {
      // Track for owner: known from memory — do not ask again
      open.push({
        id: req.id,
        label: req.label,
        critical: req.critical,
        resolvedFromMemory: true,
      })
      continue
    }

    open.push({
      id: req.id,
      label: req.label,
      critical: req.critical,
      resolvedFromMemory: false,
    })
  }

  return open
}

export function unresolvedMissing(
  items: readonly MissingInfoItem[],
): MissingInfoItem[] {
  return items.filter((i) => !i.resolvedFromMemory)
}
