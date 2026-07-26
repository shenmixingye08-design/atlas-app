import type { QualityPromptKind } from "@/lib/quality-engine/types"
import type {
  BenchmarkCase,
  RuleEvaluationIssue,
  RuleEvaluationResult,
} from "@/lib/quality-engine/benchmark/types"
import { getBenchmarkRuleProfile } from "@/lib/quality-engine/benchmark/rules"

function hasPlaceholder(text: string): boolean {
  return (
    /\[(?:TODO|要確認|ここに|placeholder|TBD)\]/i.test(text) ||
    /\{\{[^}]+\}\}/.test(text) ||
    /YOUR_[A-Z_]+/.test(text)
  )
}

function hasBrokenChars(text: string): boolean {
  return /�|\uFFFD|ï¿½/.test(text)
}

function duplicateParagraphs(text: string): number {
  const parts = text
    .split(/\n{2,}/)
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p.length > 40)
  const seen = new Set<string>()
  let dups = 0
  for (const p of parts) {
    if (seen.has(p)) dups += 1
    else seen.add(p)
  }
  return dups
}

/**
 * Rule-based evaluation — no LLM.
 * Separate from Quality Judge scores.
 */
export function evaluateWithRules(input: {
  content: string
  promptKind: QualityPromptKind | string
  caseDef?: Pick<
    BenchmarkCase,
    | "expectedSections"
    | "requiredFacts"
    | "prohibitedExpressions"
    | "expectedAudience"
    | "requiredOutputFormat"
  > | null
  companyName?: string | null
  language?: string | null
}): RuleEvaluationResult {
  const content = input.content ?? ""
  const profile = getBenchmarkRuleProfile(input.promptKind)
  const caseDef = input.caseDef
  const checks: { id: string; passed: boolean; detail: string }[] = []
  const issues: RuleEvaluationIssue[] = []

  const sections = caseDef?.expectedSections?.length
    ? caseDef.expectedSections
    : profile.defaultSections
  for (const section of sections) {
    const ok = content.includes(section)
    if (!ok) {
      issues.push({
        code: "missing_section",
        message: `必須見出し不足: ${section}`,
        severity: "error",
      })
    }
    checks.push({
      id: `section:${section}`,
      passed: ok,
      detail: ok ? "見出しあり" : "見出しなし",
    })
  }

  const facts = caseDef?.requiredFacts ?? []
  for (const fact of facts) {
    const ok = content.includes(fact)
    if (!ok) {
      issues.push({
        code: "missing_fact",
        message: `指定数値/事実の欠落: ${fact}`,
        severity: "error",
      })
    }
    checks.push({
      id: `fact:${fact}`,
      passed: ok,
      detail: ok ? "保持" : "欠落",
    })
  }

  const banned = [
    ...(caseDef?.prohibitedExpressions ?? []),
    ...profile.prohibitedExpressions,
  ]
  for (const expr of banned) {
    const hit = expr && content.includes(expr)
    if (hit) {
      issues.push({
        code: "prohibited_expression",
        message: `禁止表現: ${expr}`,
        severity: "error",
      })
    }
    checks.push({
      id: `ban:${expr}`,
      passed: !hit,
      detail: hit ? "検出" : "なし",
    })
  }

  if (input.companyName?.trim()) {
    const ok = content.includes(input.companyName.trim())
    if (!ok) {
      issues.push({
        code: "missing_company",
        message: "指定会社名なし",
        severity: "warn",
      })
    }
    checks.push({
      id: "company",
      passed: ok,
      detail: ok ? "会社名あり" : "会社名なし",
    })
  }

  const headingCount = (content.match(/^#{1,3}\s+/gm) ?? []).length
  checks.push({
    id: "heading_count",
    passed: headingCount >= profile.minHeadings,
    detail: `見出し数 ${headingCount}`,
  })
  if (headingCount < profile.minHeadings) {
    issues.push({
      code: "few_headings",
      message: `見出し数が少ない (${headingCount})`,
      severity: "warn",
    })
  }

  const lenOk =
    content.trim().length >= profile.minChars &&
    content.trim().length <= profile.maxChars
  checks.push({
    id: "length",
    passed: lenOk,
    detail: `文字数 ${content.trim().length}`,
  })

  if (profile.requireCta) {
    const cta = /CTA|お問い合わせ|ご相談|次のステップ|ご連絡|お申し込み/i.test(
      content,
    )
    checks.push({ id: "cta", passed: cta, detail: cta ? "CTAあり" : "CTAなし" })
    if (!cta) {
      issues.push({
        code: "missing_cta",
        message: "CTAなし",
        severity: "warn",
      })
    }
  }

  if (profile.requireSignature) {
    const sig = /敬具|よろしくお願い|署名|--\s*$/m.test(content)
    checks.push({
      id: "signature",
      passed: sig,
      detail: sig ? "署名あり" : "署名なし",
    })
  }

  if (profile.requireTable) {
    const table = /\|.+\|/.test(content) || /表|列/.test(content)
    checks.push({
      id: "table",
      passed: table,
      detail: table ? "表あり" : "表なし",
    })
  }

  const placeholder = hasPlaceholder(content)
  checks.push({
    id: "placeholder",
    passed: !placeholder,
    detail: placeholder ? "プレースホルダー残存" : "なし",
  })
  if (placeholder) {
    issues.push({
      code: "placeholder",
      message: "プレースホルダー残存",
      severity: "error",
    })
  }

  const broken = hasBrokenChars(content)
  checks.push({
    id: "broken_chars",
    passed: !broken,
    detail: broken ? "壊れた文字" : "なし",
  })

  const dups = duplicateParagraphs(content)
  checks.push({
    id: "duplicate_paragraphs",
    passed: dups === 0,
    detail: dups ? `重複段落 ${dups}` : "なし",
  })

  if (profile.checkFormulaErrors) {
    const formulaErr = /#REF!|#VALUE!|#DIV\/0!|数式エラー/i.test(content)
    checks.push({
      id: "formula",
      passed: !formulaErr,
      detail: formulaErr ? "数式エラー" : "なし",
    })
    if (formulaErr) {
      issues.push({
        code: "formula_error",
        message: "数式エラー",
        severity: "error",
      })
    }
  }

  const passedCount = checks.filter((c) => c.passed).length
  const score =
    checks.length === 0
      ? 100
      : Math.round((passedCount / checks.length) * 100)

  return {
    passed: issues.filter((i) => i.severity === "error").length === 0,
    score,
    checks,
    issues,
    evaluatedAt: new Date().toISOString(),
  }
}
