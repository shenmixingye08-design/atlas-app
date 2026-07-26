import type { ArtifactContextRule } from "@/lib/quality-engine/context/types"

export const blogContextRule: ArtifactContextRule = {
  preferLayers: [
    "brand",
    "industry",
    "reference",
    "past_deliverables",
    "rules",
    "deliverable",
  ],
  preferCategories: ["brand", "industry", "reference", "rules", "deliverable"],
  preferTags: ["blog", "seo", "tone", "search_intent", "forbidden"],
  excludeLayers: [],
  excludeCategories: [],
  excludeTags: ["contract_clause", "sales_cta", "excel_formula"],
  maxPastArtifacts: 3,
  keywordBoosts: ["ブログ", "seo", "検索", "記事", "トーン", "読者"],
}
