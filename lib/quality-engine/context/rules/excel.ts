import type { ArtifactContextRule } from "@/lib/quality-engine/context/types"

export const excelContextRule: ArtifactContextRule = {
  preferLayers: ["rules", "reference", "template", "deliverable"],
  preferCategories: ["rules", "reference", "template", "deliverable"],
  preferTags: [
    "excel",
    "column",
    "formula",
    "datatype",
    "aggregate",
    "table",
  ],
  excludeLayers: [],
  excludeCategories: [],
  excludeTags: ["seo", "blog_structure", "sales_cta"],
  maxPastArtifacts: 2,
  keywordBoosts: ["列", "表", "数式", "集計", "データ型", "excel"],
}
