import type { ArtifactContextRule } from "@/lib/quality-engine/context/types"

export const pdfContextRule: ArtifactContextRule = {
  preferLayers: ["design", "brand", "rules", "reference", "template"],
  preferCategories: ["design", "brand", "rules", "reference", "template"],
  preferTags: [
    "pdf",
    "layout",
    "print",
    "page",
    "heading",
    "brand_design",
  ],
  excludeLayers: [],
  excludeCategories: [],
  excludeTags: ["excel_formula", "sns_short"],
  maxPastArtifacts: 2,
  keywordBoosts: ["pdf", "レイアウト", "印刷", "ページ", "デザイン"],
}
