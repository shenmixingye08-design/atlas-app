import type { ArtifactContextRule } from "@/lib/quality-engine/context/types"

export const wordContextRule: ArtifactContextRule = {
  preferLayers: ["design", "brand", "rules", "reference", "template"],
  preferCategories: ["design", "brand", "rules", "reference", "template"],
  preferTags: [
    "word",
    "document",
    "layout",
    "heading",
    "print",
    "structure",
  ],
  excludeLayers: [],
  excludeCategories: [],
  excludeTags: ["excel_formula", "sns_short"],
  maxPastArtifacts: 2,
  keywordBoosts: ["文書", "見出し", "レイアウト", "ページ", "印刷"],
}
