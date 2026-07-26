export type ArtifactRatingType = "positive" | "negative"

export type ArtifactFeedbackSource = "user" | "owner" | "benchmark"

export type ArtifactFeedbackRecord = {
  id: string
  artifactId: string
  jobId: string | null
  userId: string
  organizationId: string | null
  ratingType: ArtifactRatingType
  positiveReasons: readonly string[]
  negativeReasons: readonly string[]
  comment: string | null
  artifactType: string | null
  artifactSubType: string | null
  qualityScore: number | null
  model: string | null
  promptVersion: string | null
  specialistVersion: string | null
  templateId: string | null
  templateVersion: string | null
  knowledgeVersion: string | null
  smartContextVersion: string | null
  qualityEngineVersion: string | null
  regenerationCount: number | null
  improvementCount: number | null
  totalApiCost: number | null
  inputTokens: number | null
  outputTokens: number | null
  finalUsed: boolean | null
  downloaded: boolean | null
  shared: boolean | null
  source: ArtifactFeedbackSource
  createdAt: string
  updatedAt: string
}

export type ArtifactFeedbackUpsertInput = {
  artifactId: string
  userId: string
  organizationId?: string | null
  jobId?: string | null
  ratingType: ArtifactRatingType
  positiveReasons?: readonly string[]
  negativeReasons?: readonly string[]
  comment?: string | null
  artifactType?: string | null
  artifactSubType?: string | null
  qualityScore?: number | null
  model?: string | null
  promptVersion?: string | null
  specialistVersion?: string | null
  templateId?: string | null
  templateVersion?: string | null
  knowledgeVersion?: string | null
  smartContextVersion?: string | null
  qualityEngineVersion?: string | null
  regenerationCount?: number | null
  improvementCount?: number | null
  totalApiCost?: number | null
  inputTokens?: number | null
  outputTokens?: number | null
  finalUsed?: boolean | null
  downloaded?: boolean | null
  shared?: boolean | null
  source?: ArtifactFeedbackSource
}

export type ArtifactFeedbackSummary = {
  totalRatings: number
  positiveCount: number
  negativeCount: number
  positiveRate: number | null
  negativeRate: number | null
  ratedArtifactCount: number
  unratedArtifactCount: number | null
  acceptedWithoutEditRate: number | null
  regenerateRate: number | null
  downloadRate: number | null
  shareRate: number | null
  avgQualityScore: number | null
  avgApiCost: number | null
  avgPositiveCost: number | null
  avgNegativeCost: number | null
  dataStatus: "ok" | "insufficient_data"
}

export type FeedbackImprovementCandidate = {
  id: string
  message: string
  evidenceCount: number
  evidenceRate: number | null
  status: "alert" | "reference"
}

export type FeedbackDivergenceWarning = {
  artifactId: string
  message: string
  qualityScore: number | null
  ratingType: ArtifactRatingType
}
