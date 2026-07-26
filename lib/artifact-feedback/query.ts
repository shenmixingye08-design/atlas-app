import type {
  ArtifactFeedbackRecord,
  ArtifactRatingType,
} from "@/lib/artifact-feedback/types"

export type ArtifactFeedbackFilters = {
  ratingType?: ArtifactRatingType | "all"
  artifactType?: string | null
  userId?: string | null
  from?: string | null
  to?: string | null
  model?: string | null
  promptVersion?: string | null
  templateId?: string | null
  knowledgeVersion?: string | null
  qualityScoreMin?: number | null
  qualityScoreMax?: number | null
  hasRegeneration?: boolean | null
  hasComment?: boolean | null
  downloaded?: boolean | null
  finalUsed?: boolean | null
}

export type ArtifactFeedbackSort =
  | "newest"
  | "oldest"
  | "positive_first"
  | "negative_first"
  | "quality_score"
  | "cost"
  | "regeneration"

export function filterArtifactFeedback(
  records: readonly ArtifactFeedbackRecord[],
  filters: ArtifactFeedbackFilters,
): ArtifactFeedbackRecord[] {
  return records.filter((r) => {
    if (filters.ratingType && filters.ratingType !== "all") {
      if (r.ratingType !== filters.ratingType) return false
    }
    if (filters.artifactType && r.artifactType !== filters.artifactType) {
      return false
    }
    if (filters.userId && r.userId !== filters.userId) return false
    if (filters.from && r.createdAt < filters.from) return false
    if (filters.to && r.createdAt > filters.to) return false
    if (filters.model && r.model !== filters.model) return false
    if (filters.promptVersion && r.promptVersion !== filters.promptVersion) {
      return false
    }
    if (
      filters.templateId &&
      r.templateId !== filters.templateId &&
      r.templateVersion !== filters.templateId
    ) {
      return false
    }
    if (
      filters.knowledgeVersion &&
      r.knowledgeVersion !== filters.knowledgeVersion
    ) {
      return false
    }
    if (
      filters.qualityScoreMin != null &&
      (r.qualityScore == null || r.qualityScore < filters.qualityScoreMin)
    ) {
      return false
    }
    if (
      filters.qualityScoreMax != null &&
      (r.qualityScore == null || r.qualityScore > filters.qualityScoreMax)
    ) {
      return false
    }
    if (filters.hasRegeneration === true && (r.regenerationCount ?? 0) <= 0) {
      return false
    }
    if (filters.hasRegeneration === false && (r.regenerationCount ?? 0) > 0) {
      return false
    }
    if (filters.hasComment === true && !r.comment?.trim()) return false
    if (filters.hasComment === false && r.comment?.trim()) return false
    if (filters.downloaded === true && r.downloaded !== true) return false
    if (filters.downloaded === false && r.downloaded === true) return false
    if (filters.finalUsed === true && r.finalUsed !== true) return false
    if (filters.finalUsed === false && r.finalUsed === true) return false
    return true
  })
}

export function sortArtifactFeedback(
  records: readonly ArtifactFeedbackRecord[],
  sort: ArtifactFeedbackSort = "newest",
): ArtifactFeedbackRecord[] {
  const list = [...records]
  switch (sort) {
    case "oldest":
      return list.sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    case "positive_first":
      return list.sort((a, b) => {
        if (a.ratingType === b.ratingType) {
          return b.updatedAt.localeCompare(a.updatedAt)
        }
        return a.ratingType === "positive" ? -1 : 1
      })
    case "negative_first":
      return list.sort((a, b) => {
        if (a.ratingType === b.ratingType) {
          return b.updatedAt.localeCompare(a.updatedAt)
        }
        return a.ratingType === "negative" ? -1 : 1
      })
    case "quality_score":
      return list.sort(
        (a, b) => (b.qualityScore ?? -1) - (a.qualityScore ?? -1),
      )
    case "cost":
      return list.sort(
        (a, b) => (b.totalApiCost ?? -1) - (a.totalApiCost ?? -1),
      )
    case "regeneration":
      return list.sort(
        (a, b) => (b.regenerationCount ?? 0) - (a.regenerationCount ?? 0),
      )
    case "newest":
    default:
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }
}
