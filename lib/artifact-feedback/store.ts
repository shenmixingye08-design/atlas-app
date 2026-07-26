import type {
  ArtifactFeedbackRecord,
  ArtifactFeedbackUpsertInput,
} from "@/lib/artifact-feedback/types"

type Scope = typeof globalThis & {
  __atlasArtifactFeedback?: Map<string, ArtifactFeedbackRecord>
  __atlasArtifactFeedbackHistory?: Array<{
    id: string
    feedbackId: string
    artifactId: string
    userId: string
    ratingType: ArtifactFeedbackRecord["ratingType"]
    positiveReasons: readonly string[]
    negativeReasons: readonly string[]
    comment: string | null
    changedAt: string
  }>
}

function scope(): Scope {
  return globalThis as Scope
}

function key(userId: string, artifactId: string): string {
  return `${userId}::${artifactId}`
}

function map(): Map<string, ArtifactFeedbackRecord> {
  const s = scope()
  if (!s.__atlasArtifactFeedback) s.__atlasArtifactFeedback = new Map()
  return s.__atlasArtifactFeedback
}

function history() {
  const s = scope()
  if (!s.__atlasArtifactFeedbackHistory) s.__atlasArtifactFeedbackHistory = []
  return s.__atlasArtifactFeedbackHistory
}

export function resetArtifactFeedbackForTests(): void {
  const s = scope()
  s.__atlasArtifactFeedback = new Map()
  s.__atlasArtifactFeedbackHistory = []
}

export function getUserArtifactFeedback(
  userId: string,
  artifactId: string,
): ArtifactFeedbackRecord | null {
  return map().get(key(userId, artifactId)) ?? null
}

export function listFeedbackForUser(userId: string): ArtifactFeedbackRecord[] {
  return Array.from(map().values())
    .filter((r) => r.userId === userId)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
}

export function listAllArtifactFeedback(limit = 500): ArtifactFeedbackRecord[] {
  return Array.from(map().values())
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, Math.max(1, Math.min(limit, 2_000)))
}

function pushHistory(record: ArtifactFeedbackRecord): void {
  history().unshift({
    id: crypto.randomUUID(),
    feedbackId: record.id,
    artifactId: record.artifactId,
    userId: record.userId,
    ratingType: record.ratingType,
    positiveReasons: record.positiveReasons,
    negativeReasons: record.negativeReasons,
    comment: record.comment,
    changedAt: new Date().toISOString(),
  })
  if (history().length > 5_000) history().length = 5_000
}

/** Upsert current rating for (userId, artifactId). Avoids duplicate current rows. */
export function upsertArtifactFeedback(
  input: ArtifactFeedbackUpsertInput,
): ArtifactFeedbackRecord {
  const now = new Date().toISOString()
  const existing = getUserArtifactFeedback(input.userId, input.artifactId)
  const ratingType = input.ratingType
  const positiveReasons =
    ratingType === "positive" ? (input.positiveReasons ?? []) : []
  const negativeReasons =
    ratingType === "negative" ? (input.negativeReasons ?? []) : []

  const record: ArtifactFeedbackRecord = {
    id: existing?.id ?? crypto.randomUUID(),
    artifactId: input.artifactId,
    jobId: input.jobId ?? existing?.jobId ?? null,
    userId: input.userId,
    organizationId: input.organizationId ?? existing?.organizationId ?? null,
    ratingType,
    positiveReasons,
    negativeReasons,
    comment: input.comment ?? existing?.comment ?? null,
    artifactType: input.artifactType ?? existing?.artifactType ?? null,
    artifactSubType: input.artifactSubType ?? existing?.artifactSubType ?? null,
    qualityScore:
      input.qualityScore !== undefined
        ? input.qualityScore
        : (existing?.qualityScore ?? null),
    model: input.model ?? existing?.model ?? null,
    promptVersion: input.promptVersion ?? existing?.promptVersion ?? null,
    specialistVersion:
      input.specialistVersion ?? existing?.specialistVersion ?? null,
    templateId: input.templateId ?? existing?.templateId ?? null,
    templateVersion: input.templateVersion ?? existing?.templateVersion ?? null,
    knowledgeVersion:
      input.knowledgeVersion ?? existing?.knowledgeVersion ?? null,
    smartContextVersion:
      input.smartContextVersion ?? existing?.smartContextVersion ?? null,
    qualityEngineVersion:
      input.qualityEngineVersion ?? existing?.qualityEngineVersion ?? null,
    regenerationCount:
      input.regenerationCount !== undefined
        ? input.regenerationCount
        : (existing?.regenerationCount ?? null),
    improvementCount:
      input.improvementCount !== undefined
        ? input.improvementCount
        : (existing?.improvementCount ?? null),
    totalApiCost:
      input.totalApiCost !== undefined
        ? input.totalApiCost
        : (existing?.totalApiCost ?? null),
    inputTokens:
      input.inputTokens !== undefined
        ? input.inputTokens
        : (existing?.inputTokens ?? null),
    outputTokens:
      input.outputTokens !== undefined
        ? input.outputTokens
        : (existing?.outputTokens ?? null),
    finalUsed:
      input.finalUsed !== undefined
        ? input.finalUsed
        : (existing?.finalUsed ?? null),
    downloaded:
      input.downloaded !== undefined
        ? input.downloaded
        : (existing?.downloaded ?? null),
    shared:
      input.shared !== undefined ? input.shared : (existing?.shared ?? null),
    source: input.source ?? existing?.source ?? "user",
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }

  if (existing) pushHistory(existing)
  map().set(key(record.userId, record.artifactId), record)
  void persistFeedbackToDb(record)
  return record
}

export function deleteUserArtifactFeedback(
  userId: string,
  artifactId: string,
): boolean {
  const existing = getUserArtifactFeedback(userId, artifactId)
  if (!existing) return false
  pushHistory(existing)
  map().delete(key(userId, artifactId))
  void deleteFeedbackFromDb(existing.id)
  return true
}

async function persistFeedbackToDb(record: ArtifactFeedbackRecord): Promise<void> {
  try {
    const { createServiceRoleClientIfConfigured } = await import(
      "@/lib/supabase/service-role"
    )
    const client = createServiceRoleClientIfConfigured()
    if (!client) return
    await client.from("atlas_artifact_feedback").upsert({
      id: record.id,
      artifact_id: record.artifactId,
      job_id: record.jobId,
      user_id: record.userId,
      organization_id: record.organizationId,
      rating_type: record.ratingType,
      positive_reasons: record.positiveReasons,
      negative_reasons: record.negativeReasons,
      comment: record.comment,
      artifact_type: record.artifactType,
      artifact_sub_type: record.artifactSubType,
      quality_score: record.qualityScore,
      model: record.model,
      prompt_version: record.promptVersion,
      specialist_version: record.specialistVersion,
      template_id: record.templateId,
      template_version: record.templateVersion,
      knowledge_version: record.knowledgeVersion,
      smart_context_version: record.smartContextVersion,
      quality_engine_version: record.qualityEngineVersion,
      regeneration_count: record.regenerationCount,
      improvement_count: record.improvementCount,
      total_api_cost: record.totalApiCost,
      input_tokens: record.inputTokens,
      output_tokens: record.outputTokens,
      final_used: record.finalUsed,
      downloaded: record.downloaded,
      shared: record.shared,
      source: record.source,
      created_at: record.createdAt,
      updated_at: record.updatedAt,
    } as never)
  } catch {
    // memory remains source of truth
  }
}

async function deleteFeedbackFromDb(id: string): Promise<void> {
  try {
    const { createServiceRoleClientIfConfigured } = await import(
      "@/lib/supabase/service-role"
    )
    const client = createServiceRoleClientIfConfigured()
    if (!client) return
    await client.from("atlas_artifact_feedback").delete().eq("id", id)
  } catch {
    // ignore
  }
}
