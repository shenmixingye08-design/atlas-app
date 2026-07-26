import type { ArtifactContextRule } from "@/lib/quality-engine/context/types"

export const contractContextRule: ArtifactContextRule = {
  preferLayers: [
    "rules",
    "reference",
    "template",
    "company",
    "business_profile",
    "user_instruction",
    "deliverable",
  ],
  preferCategories: [
    "rules",
    "reference",
    "template",
    "company",
    "business_profile",
    "deliverable",
  ],
  preferTags: [
    "contract",
    "legal",
    "compliance",
    "clause",
    "parties",
    "forbidden",
  ],
  excludeLayers: [],
  excludeCategories: [],
  excludeTags: ["seo", "ad_copy", "blog_structure"],
  maxPastArtifacts: 2,
  keywordBoosts: ["契約", "条項", "法務", "当事者", "禁止", "コンプライアンス"],
}
