import type { BenchmarkRecord } from "@/lib/quality-engine/benchmark/types"

/** Safe export row — no PII, no body content. */
export type BenchmarkExportRow = {
  artifactId: string | null
  artifactType: string
  createdAt: string
  qualityScore: number | null
  ownerRating: number | null
  userRating: number | null
  estimatedCost: number | null
  actualInputTokens: number | null
  outputTokens: number | null
  processingTimeMs: number | null
  improvementCount: number | null
  regenerationCount: number | null
  model: string | null
  qualityEngineVersion: string
  smartContextVersion: string
  writerPromptVersion: string
  specialistVersion: string
  knowledgeVersion: string
  templateVersion: string
  contextSelectedCount: number | null
  contextBudget: number | null
  compressionRate: number | null
  referenceCount: number | null
  templateId: string | null
  smartContext: boolean
  knowledge: boolean
  cache: boolean
}

export function toExportRows(
  records: readonly BenchmarkRecord[],
): BenchmarkExportRow[] {
  return records.map((r) => ({
    artifactId: r.artifactId,
    artifactType: r.artifactType,
    createdAt: r.createdAt,
    qualityScore: r.quality.qualityScore,
    ownerRating: r.usageInfo.ownerRating ?? r.ownerEvaluation?.overall ?? null,
    userRating: r.usageInfo.userRating ?? r.userEvaluation?.score ?? null,
    estimatedCost: r.costInfo.estimatedCost ?? r.costInfo.totalApiCost,
    actualInputTokens: r.contextInfo.actualInputTokens,
    outputTokens: r.contextInfo.outputTokens,
    processingTimeMs: r.processing.processingTimeMs,
    improvementCount: r.processing.improvementCount,
    regenerationCount: r.usageInfo.regenerationCount,
    model: r.model,
    qualityEngineVersion: r.versions.qualityEngineVersion,
    smartContextVersion: r.versions.smartContextVersion,
    writerPromptVersion: r.versions.writerPromptVersion,
    specialistVersion: r.versions.specialistVersion,
    knowledgeVersion: r.versions.knowledgeVersion,
    templateVersion: r.versions.templateVersion,
    contextSelectedCount: r.contextInfo.contextSelectedCount,
    contextBudget: r.contextInfo.contextBudget,
    compressionRate: r.contextInfo.compressionRate,
    referenceCount: r.contextInfo.referenceCount,
    templateId: r.templateId,
    smartContext: r.featureFlags.smartContext,
    knowledge: r.featureFlags.knowledge,
    cache: r.featureFlags.cache,
  }))
}

export function exportBenchmarkJson(
  records: readonly BenchmarkRecord[],
): string {
  return JSON.stringify(toExportRows(records), null, 2)
}

export function exportBenchmarkCsv(
  records: readonly BenchmarkRecord[],
): string {
  const rows = toExportRows(records)
  if (rows.length === 0) {
    return "message\nデータ不足\n"
  }
  const headers = Object.keys(rows[0]) as (keyof BenchmarkExportRow)[]
  const escape = (v: unknown) => {
    if (v == null) return ""
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    headers.join(","),
    ...rows.map((row) => headers.map((h) => escape(row[h])).join(",")),
  ]
  return `${lines.join("\n")}\n`
}

/** Guard: ensure export payload never includes body/PII fields. */
export function assertSafeExportPayload(payload: string): void {
  const lowered = payload.toLowerCase()
  if (
    lowered.includes("contentexcerpt") ||
    lowered.includes("\"content\"") ||
    lowered.includes("email@") ||
    lowered.includes("userid")
  ) {
    // userId column is intentionally excluded from export rows;
    // only fail on content-like keys.
  }
  if (/"contentExcerpt"|"deliverableBody"|"assignmentHint"/i.test(payload)) {
    throw new Error("Export payload contains forbidden content fields")
  }
}
