import { createHash } from "node:crypto"

import {
  buildVersionSnapshot,
  DEFAULT_QUALITY_THRESHOLDS,
} from "@/lib/quality-engine/benchmark/config"
import { evaluateWithRules } from "@/lib/quality-engine/benchmark/rule-evaluator"
import { upsertBenchmarkRecord } from "@/lib/quality-engine/benchmark/store"
import type {
  BenchmarkFeatureFlags,
  BenchmarkRecord,
  MeasurableNumber,
} from "@/lib/quality-engine/benchmark/types"
import type { QualityContextPack } from "@/lib/quality-engine/context-pack"
import type {
  QualityEngineTelemetry,
  QualityJudgeResult,
  QualityReviewerResult,
} from "@/lib/quality-engine/types"

function n(value: unknown): MeasurableNumber {
  if (typeof value === "number" && Number.isFinite(value)) return value
  return null
}

function fingerprint(parts: Array<string | null | undefined>): string | null {
  const raw = parts.filter(Boolean).join("|")
  if (!raw) return null
  return createHash("sha256").update(raw).digest("hex").slice(0, 24)
}

function emptyUsage(): BenchmarkRecord["usageInfo"] {
  return {
    downloaded: null,
    downloadCount: null,
    regenerated: null,
    regenerationCount: null,
    userRating: null,
    ownerRating: null,
    userFeedback: null,
    ownerFeedback: null,
    acceptedWithoutEdit: null,
    editedAfterGeneration: null,
    editDistance: null,
    finalUsed: null,
    failureReason: null,
  }
}

export type RecordBenchmarkFromEngineInput = {
  telemetry: QualityEngineTelemetry
  judge: QualityJudgeResult
  reviewer: QualityReviewerResult | null
  contextPack?: QualityContextPack | null
  assignment?: string
  deliverableTitle?: string
  deliverableContent?: string
  artifactId?: string | null
  jobId?: string | null
  userId?: string | null
  organizationId?: string | null
  templateId?: string | null
  model?: string | null
  /** Explicit flags when known; otherwise inferred from telemetry. */
  featureFlags?: Partial<BenchmarkFeatureFlags>
  patternLabel?: string | null
  runId?: string | null
  caseId?: string | null
  extraLlmCallsFromSelection?: number
}

/**
 * Persist a Benchmark Record from an existing Quality Engine run.
 * Does not call any LLM.
 */
export function recordBenchmarkFromEngine(
  input: RecordBenchmarkFromEngineInput,
): BenchmarkRecord {
  const sc = input.telemetry.smartContext
  const ku = input.telemetry.knowledgeUsage
  const timings = input.telemetry.timings
  const processingMs =
    (timings.plannerMs ?? 0) +
    (timings.writerMs ?? 0) +
    (timings.reviewerMs ?? 0) +
    (timings.judgeMs ?? 0) +
    (timings.formatterMs ?? 0) +
    (timings.improveMs ?? 0)

  const flags: BenchmarkFeatureFlags = {
    qualityEngine: true,
    smartContext: Boolean(sc),
    knowledge: Boolean(ku?.knowledge),
    reference: Boolean(ku?.reference),
    template: Boolean(ku?.template),
    cache: sc?.cacheHit ?? false,
    reviewer: (input.telemetry.reviewerCount ?? 0) > 0,
    judge: input.telemetry.finalScore != null,
    ...input.featureFlags,
  }

  const model =
    input.model ??
    sc?.model ??
    null

  const versions = buildVersionSnapshot({
    templateVersion: input.templateId ?? null,
    model,
  })

  const ruleEvaluation =
    input.deliverableContent && input.deliverableContent.trim()
      ? evaluateWithRules({
          content: input.deliverableContent,
          promptKind: input.telemetry.promptKind,
          companyName: input.contextPack?.businessProfileSummary
            ? input.contextPack.businessProfileSummary.slice(0, 40)
            : null,
        })
      : null

  const criteria = input.judge.criteria
  const record: BenchmarkRecord = {
    id: crypto.randomUUID(),
    runId: input.runId ?? null,
    caseId: input.caseId ?? null,
    artifactId: input.artifactId ?? null,
    jobId: input.jobId ?? null,
    userId: input.userId ?? null,
    organizationId: input.organizationId ?? null,
    artifactType: input.telemetry.promptKind,
    artifactSubType: input.telemetry.specialistLabel,
    title: input.deliverableTitle ?? null,
    model,
    status: input.telemetry.passed ? "completed" : "partial",
    patternLabel: input.patternLabel ?? null,
    featureFlags: flags,
    versions: {
      qualityEngineVersion: versions.qualityEngineVersion,
      smartContextVersion: versions.smartContextVersion,
      specialistVersion: versions.specialistVersion,
      writerPromptVersion: versions.writerPromptVersion,
      reviewerPromptVersion: versions.reviewerPromptVersion,
      judgePromptVersion: versions.judgePromptVersion,
      knowledgeVersion: versions.knowledgeVersion,
      artifactRendererVersion: versions.artifactRendererVersion,
      templateVersion: versions.templateVersion,
      model: versions.model,
    },
    quality: {
      qualityScore: n(input.telemetry.finalScore),
      reviewerScore: input.reviewer
        ? input.reviewer.approved
          ? 90
          : 55
        : null,
      judgeScore: n(input.judge.overallScore),
      completenessScore: n(criteria.completeness),
      accuracyScore: n(
        (criteria.expertise + criteria.information) / 2,
      ),
      relevanceScore: n(criteria.persuasiveness),
      structureScore: n(criteria.structure),
      readabilityScore: n(criteria.readability),
      designScore: n(criteria.design),
      brandConsistencyScore: null,
      instructionComplianceScore: null,
      informationSufficiencyScore: n(criteria.information),
    },
    processing: {
      writerCalls: n(1 + (input.telemetry.improveCount ?? 0)),
      reviewerCalls: n(input.telemetry.reviewerCount),
      judgeCalls: n(1),
      improvementCount: n(input.telemetry.improveCount),
      retryCount: null,
      totalAiCalls: n(sc?.aiCallCount),
      extraLlmCalls: n(
        input.extraLlmCallsFromSelection ?? sc?.extraLlmCalls ?? 0,
      ),
      processingTimeMs: n(processingMs),
      queueTimeMs: null,
      generationTimeMs: n(timings.writerMs + timings.improveMs),
    },
    contextInfo: {
      contextCandidateCount: n(sc?.candidateCount),
      contextSelectedCount: n(sc?.selectedCount),
      contextExcludedCount: n(sc?.excludedCount),
      contextRequiredCount: n(sc?.requiredCount),
      contextBudget: n(sc?.budgetTokens),
      estimatedContextTokens: n(sc?.estimatedInputTokens),
      actualInputTokens: n(sc?.actualInputTokens),
      outputTokens: n(sc?.outputTokens),
      cachedContext: sc ? sc.cacheHit : null,
      compressionBeforeSize: n(sc?.preCompressChars),
      compressionAfterSize: n(sc?.postCompressChars),
      compressionRate: n(sc?.reductionRate),
      knowledgeCount: n(sc?.knowledgeEntryCount ?? ku?.entryCount),
      referenceCount: n(sc?.usedReferenceCount ?? (ku?.reference ? 1 : 0)),
      pastArtifactCount: n(sc?.usedPastArtifactCount),
    },
    costInfo: {
      inputCost: null,
      outputCost: null,
      visionCost: null,
      researchCost: null,
      totalApiCost: n(sc?.estimatedApiCostUsd),
      estimatedCost: n(sc?.estimatedApiCostUsd),
      currency: "USD",
    },
    usageInfo: emptyUsage(),
    ruleEvaluation,
    ownerEvaluation: null,
    userEvaluation: null,
    knowledgeFingerprint: fingerprint([
      String(ku?.entryCount ?? ""),
      ...(ku?.layersUsed ?? []),
    ]),
    contextFingerprint: fingerprint([
      String(sc?.selectedCount ?? ""),
      String(sc?.estimatedInputTokens ?? ""),
      String(sc?.postCompressChars ?? ""),
    ]),
    referenceFingerprint: fingerprint([
      input.contextPack?.reference.summary?.slice(0, 200),
    ]),
    templateId: input.templateId ?? input.contextPack?.templateId ?? null,
    businessProfileVersion: input.contextPack?.businessProfileSummary
      ? fingerprint([input.contextPack.businessProfileSummary.slice(0, 120)])
      : null,
    createdAt: input.telemetry.recordedAt,
    completedAt: input.telemetry.recordedAt,
    contentExcerpt: null,
  }

  upsertBenchmarkRecord(record)
  return record
}

export function evaluateQualityGate(input: {
  artifactType: string
  qualityScore: MeasurableNumber
}): {
  belowThreshold: boolean
  threshold: number | null
  warnOnly: boolean
  message: string | null
} {
  const threshold =
    DEFAULT_QUALITY_THRESHOLDS[
      input.artifactType as keyof typeof DEFAULT_QUALITY_THRESHOLDS
    ] ?? null
  if (threshold == null || input.qualityScore == null) {
    return {
      belowThreshold: false,
      threshold,
      warnOnly: true,
      message: null,
    }
  }
  if (input.qualityScore >= threshold) {
    return {
      belowThreshold: false,
      threshold,
      warnOnly: true,
      message: null,
    }
  }
  return {
    belowThreshold: true,
    threshold,
    warnOnly: true,
    message: `品質確認推奨: ${input.artifactType} の Quality Score ${input.qualityScore} が基準 ${threshold} を下回っています`,
  }
}
