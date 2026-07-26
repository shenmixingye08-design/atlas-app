import type { ArtifactContextRule } from "@/lib/quality-engine/context/types"

export const socialContextRule: ArtifactContextRule = {
  preferLayers: [
    "brand",
    "rules",
    "business_profile",
    "user_instruction",
  ],
  preferCategories: ["brand", "rules", "business_profile", "user_instruction"],
  preferTags: ["sns", "short", "tone", "hashtag", "forbidden"],
  excludeLayers: ["past_deliverables"],
  excludeCategories: ["past_deliverables"],
  excludeTags: [
    "contract_clause",
    "long_form",
    "excel_formula",
    "sales_deck",
  ],
  maxPastArtifacts: 1,
  keywordBoosts: ["sns", "投稿", "短文", "ハッシュタグ", "トーン"],
}
