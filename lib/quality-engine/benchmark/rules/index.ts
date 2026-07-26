export type BenchmarkRuleProfile = {
  defaultSections: string[]
  prohibitedExpressions: string[]
  minHeadings: number
  minChars: number
  maxChars: number
  requireCta: boolean
  requireSignature: boolean
  requireTable: boolean
  checkFormulaErrors: boolean
}

const DEFAULT: BenchmarkRuleProfile = {
  defaultSections: [],
  prohibitedExpressions: ["絶対儲かる", "必ず成功", "業界唯一"],
  minHeadings: 1,
  minChars: 40,
  maxChars: 80_000,
  requireCta: false,
  requireSignature: false,
  requireTable: false,
  checkFormulaErrors: false,
}

const PROFILES: Record<string, BenchmarkRuleProfile> = {
  sales_material: {
    ...DEFAULT,
    defaultSections: ["課題", "解決", "CTA"],
    requireCta: true,
    minHeadings: 3,
    minChars: 200,
  },
  proposal: {
    ...DEFAULT,
    defaultSections: ["課題", "提案"],
    requireCta: true,
    minHeadings: 2,
  },
  blog: {
    ...DEFAULT,
    defaultSections: ["まとめ"],
    minHeadings: 3,
    minChars: 400,
  },
  contract: {
    ...DEFAULT,
    defaultSections: ["目的", "定義"],
    prohibitedExpressions: [...DEFAULT.prohibitedExpressions, "絶対に安全"],
    minHeadings: 2,
    minChars: 300,
  },
  excel: {
    ...DEFAULT,
    requireTable: true,
    checkFormulaErrors: true,
    minHeadings: 0,
  },
  word: {
    ...DEFAULT,
    minHeadings: 2,
    minChars: 200,
  },
  pdf: {
    ...DEFAULT,
    minHeadings: 2,
    minChars: 200,
  },
  email: {
    ...DEFAULT,
    requireSignature: true,
    minHeadings: 0,
    minChars: 40,
    maxChars: 4_000,
  },
  sns: {
    ...DEFAULT,
    minHeadings: 0,
    minChars: 10,
    maxChars: 800,
  },
}

export function getBenchmarkRuleProfile(
  kind: string,
): BenchmarkRuleProfile {
  return PROFILES[kind] ?? DEFAULT
}
