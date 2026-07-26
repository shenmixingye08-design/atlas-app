import type { ArtifactContextRule } from "@/lib/quality-engine/context/types"

export const emailContextRule: ArtifactContextRule = {
  preferLayers: [
    "business_profile",
    "company",
    "brand",
    "rules",
    "user_instruction",
  ],
  preferCategories: [
    "business_profile",
    "company",
    "brand",
    "rules",
    "user_instruction",
  ],
  preferTags: [
    "email",
    "tone",
    "signature",
    "recipient",
    "forbidden",
    "purpose",
  ],
  excludeLayers: [],
  excludeCategories: [],
  excludeTags: ["contract_clause", "excel_formula", "long_form_seo"],
  maxPastArtifacts: 2,
  keywordBoosts: ["メール", "宛先", "署名", "文体", "件名"],
}
