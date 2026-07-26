import type { QualityPromptKind } from "@/lib/quality-engine/types"
import type { ArtifactContextRule } from "@/lib/quality-engine/context/types"
import { getPastArtifactCap } from "@/lib/quality-engine/context/config"
import { blogContextRule } from "@/lib/quality-engine/context/rules/blog"
import { contractContextRule } from "@/lib/quality-engine/context/rules/contract"
import { emailContextRule } from "@/lib/quality-engine/context/rules/email"
import { excelContextRule } from "@/lib/quality-engine/context/rules/excel"
import { pdfContextRule } from "@/lib/quality-engine/context/rules/pdf"
import { salesContextRule } from "@/lib/quality-engine/context/rules/sales"
import { socialContextRule } from "@/lib/quality-engine/context/rules/social"
import { wordContextRule } from "@/lib/quality-engine/context/rules/word"

const DEFAULT_RULE: ArtifactContextRule = {
  preferLayers: [
    "user_instruction",
    "business_profile",
    "brand",
    "rules",
    "reference",
  ],
  preferCategories: [
    "user_instruction",
    "business_profile",
    "brand",
    "rules",
    "reference",
  ],
  preferTags: [],
  excludeLayers: [],
  excludeCategories: [],
  excludeTags: [],
  maxPastArtifacts: 2,
  keywordBoosts: [],
}

const RULES: Partial<Record<QualityPromptKind, ArtifactContextRule>> = {
  sales_material: salesContextRule,
  proposal: salesContextRule,
  planning: salesContextRule,
  blog: blogContextRule,
  contract: contractContextRule,
  excel: excelContextRule,
  word: wordContextRule,
  pdf: pdfContextRule,
  email: emailContextRule,
  sns: socialContextRule,
  report: wordContextRule,
}

export function getArtifactContextRule(
  kind: QualityPromptKind,
): ArtifactContextRule {
  const rule = RULES[kind] ?? DEFAULT_RULE
  return {
    ...rule,
    maxPastArtifacts: rule.maxPastArtifacts || getPastArtifactCap(kind),
  }
}
