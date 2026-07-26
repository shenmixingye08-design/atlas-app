import { createHash } from "node:crypto"

import { estimateTokens } from "@/lib/ai/cost-meter"
import {
  BENCHMARK_COST_LIMITS,
  buildVersionSnapshot,
} from "@/lib/quality-engine/benchmark/config"
import { evaluateWithRules } from "@/lib/quality-engine/benchmark/rule-evaluator"
import {
  findBenchmarkRunByIdempotency,
  getActiveBenchmarkRunId,
  getBenchmarkCase,
  getBenchmarkRun,
  listBenchmarkCases,
  saveBenchmarkRun,
  setActiveBenchmarkRunId,
  upsertBenchmarkRecord,
} from "@/lib/quality-engine/benchmark/store"
import type {
  BenchmarkPatternConfig,
  BenchmarkRecord,
  BenchmarkRun,
  BenchmarkRunConfig,
} from "@/lib/quality-engine/benchmark/types"
import {
  collectKnowledgeCandidates,
  mergeKnowledgeForWriter,
} from "@/lib/quality-engine/knowledge"
import { selectSmartContext } from "@/lib/quality-engine/context"
import { buildReferenceInsights } from "@/lib/quality-engine/reference-engine"
import type { QualityPromptKind } from "@/lib/quality-engine/types"

function emptyQuality(): BenchmarkRecord["quality"] {
  return {
    qualityScore: null,
    reviewerScore: null,
    judgeScore: null,
    completenessScore: null,
    accuracyScore: null,
    relevanceScore: null,
    structureScore: null,
    readabilityScore: null,
    designScore: null,
    brandConsistencyScore: null,
    instructionComplianceScore: null,
    informationSufficiencyScore: null,
  }
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

export function estimateBenchmarkCostUsd(config: BenchmarkRunConfig): number {
  const cases = Math.min(
    config.caseIds.length || 1,
    BENCHMARK_COST_LIMITS.maxCasesHard,
  )
  const patterns = Math.min(
    config.patterns.length || 1,
    BENCHMARK_COST_LIMITS.maxPatternsHard,
  )
  const repeats = Math.min(
    config.repeats || 1,
    BENCHMARK_COST_LIMITS.maxRepeatsHard,
  )
  if (!config.executeGeneration && !config.aiReevaluate) return 0
  return (
    cases *
    patterns *
    repeats *
    BENCHMARK_COST_LIMITS.estimatedCostPerGenerationUsd
  )
}

export function validateBenchmarkRunConfig(config: BenchmarkRunConfig): {
  ok: boolean
  errors: string[]
} {
  const errors: string[] = []
  if (config.caseIds.length === 0) errors.push("テストケースを選択してください")
  if (config.caseIds.length > BENCHMARK_COST_LIMITS.maxCasesHard) {
    errors.push(`最大実行件数は${BENCHMARK_COST_LIMITS.maxCasesHard}です`)
  }
  if (config.patterns.length === 0) errors.push("比較パターンが必要です")
  if (config.patterns.length > BENCHMARK_COST_LIMITS.maxPatternsHard) {
    errors.push(`最大パターン数は${BENCHMARK_COST_LIMITS.maxPatternsHard}です`)
  }
  if (config.repeats > BENCHMARK_COST_LIMITS.maxRepeatsHard) {
    errors.push(`最大繰り返しは${BENCHMARK_COST_LIMITS.maxRepeatsHard}です`)
  }
  if (config.executeGeneration || config.aiReevaluate) {
    errors.push(
      "コスト保護: デフォルトでは生成LLM/AI再評価を起動しません。Smart Context ON/OFF とルール評価の比較のみ実行できます。",
    )
  }
  return { ok: errors.length === 0, errors }
}

function idempotencyKey(
  createdBy: string,
  config: BenchmarkRunConfig,
): string {
  const raw = JSON.stringify({
    createdBy,
    caseIds: [...config.caseIds].sort(),
    patterns: config.patterns,
    repeats: config.repeats,
    executeGeneration: config.executeGeneration,
    aiReevaluate: config.aiReevaluate,
  })
  return createHash("sha256").update(raw).digest("hex").slice(0, 32)
}

function measureContextForPattern(input: {
  promptKind: QualityPromptKind
  request: string
  smartContext: boolean
  knowledge: boolean
}): {
  candidateCount: number
  selectedCount: number
  excludedCount: number
  requiredCount: number
  budget: number
  estimatedTokens: number
  before: number
  after: number
  rate: number
  cacheHit: boolean
  extraLlmCalls: number
} {
  const reference = buildReferenceInsights({})
  const candidates = input.knowledge
    ? collectKnowledgeCandidates({
        promptKind: input.promptKind,
        assignment: input.request,
        metadata: {
          businessProfileSummary: "株式会社サンプル / Benchmark固定プロファイル",
          templateHints: "benchmark-template",
        },
        knowledge: null,
        reference,
        businessProfileSummary: "株式会社サンプル / Benchmark固定プロファイル",
        visionSummary: "",
        userSettingsSummary: "",
        pastDeliverableHints: "",
        templateId: "benchmark-template",
        templateHints: "benchmark-template",
      })
    : collectKnowledgeCandidates({
        promptKind: input.promptKind,
        assignment: input.request,
        metadata: {},
        knowledge: null,
        reference,
        businessProfileSummary: "",
        visionSummary: "",
        userSettingsSummary: "",
        pastDeliverableHints: "",
        templateId: null,
        templateHints: "",
      })

  if (!input.smartContext) {
    const merged = mergeKnowledgeForWriter({
      promptKind: input.promptKind,
      assignment: input.request,
      metadata: {
        businessProfileSummary: input.knowledge
          ? "株式会社サンプル / Benchmark固定プロファイル"
          : "",
      },
      knowledge: null,
      reference,
      businessProfileSummary: input.knowledge
        ? "株式会社サンプル / Benchmark固定プロファイル"
        : "",
      visionSummary: "",
      userSettingsSummary: "",
      pastDeliverableHints: "",
      templateId: input.knowledge ? "benchmark-template" : null,
      templateHints: input.knowledge ? "benchmark-template" : "",
    })
    const tokens = estimateTokens(merged.mergedText)
    return {
      candidateCount: merged.candidates.length,
      selectedCount: merged.candidates.length,
      excludedCount: 0,
      requiredCount: merged.candidates.filter((c) => c.meta.required).length,
      budget: tokens,
      estimatedTokens: tokens,
      before: merged.mergedText.length,
      after: merged.mergedText.length,
      rate: 0,
      cacheHit: false,
      extraLlmCalls: 0,
    }
  }

  const selection = selectSmartContext({
    candidates,
    promptKind: input.promptKind,
    assignment: input.request,
    userId: "benchmark-owner",
    organizationId: "benchmark",
    bypassCache: true,
  })
  return {
    candidateCount: selection.stats.candidateCount,
    selectedCount: selection.stats.selectedCount,
    excludedCount: selection.stats.excludedCount,
    requiredCount: selection.stats.requiredCount,
    budget: selection.stats.budgetTokens,
    estimatedTokens: selection.stats.estimatedInputTokens,
    before: selection.stats.preCompressChars,
    after: selection.stats.postCompressChars,
    rate: selection.stats.reductionRate,
    cacheHit: selection.stats.cacheHit,
    extraLlmCalls: 0,
  }
}

/**
 * Owner Benchmark Run — default: no Writer/Judge LLM.
 * Compares Smart Context ON/OFF context metrics + rule eval on fixture text.
 */
export function createAndExecuteBenchmarkRun(input: {
  createdBy: string
  config: BenchmarkRunConfig
  confirmCost?: boolean
}): { run: BenchmarkRun; results: BenchmarkRecord[]; errors: string[] } {
  const validation = validateBenchmarkRunConfig(input.config)
  if (!validation.ok) {
    const failed: BenchmarkRun = {
      id: crypto.randomUUID(),
      createdBy: input.createdBy,
      status: "failed",
      config: input.config,
      tags: input.config.tags,
      memo: input.config.memo,
      estimatedMaxCostUsd: estimateBenchmarkCostUsd(input.config),
      actualCostUsd: 0,
      caseCount: input.config.caseIds.length,
      patternCount: input.config.patterns.length,
      resultCount: 0,
      idempotencyKey: idempotencyKey(input.createdBy, input.config),
      startedAt: null,
      completedAt: new Date().toISOString(),
      cancelledAt: null,
      errorMessage: validation.errors.join("; "),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    return { run: failed, results: [], errors: validation.errors }
  }

  if (input.config.caseIds.length > BENCHMARK_COST_LIMITS.maxCasesDefault) {
    if (!input.confirmCost) {
      return {
        run: {
          id: crypto.randomUUID(),
          createdBy: input.createdBy,
          status: "failed",
          config: input.config,
          tags: input.config.tags,
          memo: input.config.memo,
          estimatedMaxCostUsd: estimateBenchmarkCostUsd(input.config),
          actualCostUsd: 0,
          caseCount: input.config.caseIds.length,
          patternCount: input.config.patterns.length,
          resultCount: 0,
          idempotencyKey: idempotencyKey(input.createdBy, input.config),
          startedAt: null,
          completedAt: new Date().toISOString(),
          cancelledAt: null,
          errorMessage: "実行前確認が必要です（ケース数がデフォルト上限を超過）",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        results: [],
        errors: ["実行前確認が必要です"],
      }
    }
  }

  const key = idempotencyKey(input.createdBy, input.config)
  const existing = findBenchmarkRunByIdempotency(key)
  if (existing && (existing.status === "running" || existing.status === "completed")) {
    return {
      run: existing,
      results: [],
      errors: ["重複実行を防止しました"],
    }
  }

  if (getActiveBenchmarkRunId()) {
    return {
      run: {
        id: crypto.randomUUID(),
        createdBy: input.createdBy,
        status: "failed",
        config: input.config,
        tags: input.config.tags,
        memo: input.config.memo,
        estimatedMaxCostUsd: estimateBenchmarkCostUsd(input.config),
        actualCostUsd: 0,
        caseCount: input.config.caseIds.length,
        patternCount: input.config.patterns.length,
        resultCount: 0,
        idempotencyKey: key,
        startedAt: null,
        completedAt: new Date().toISOString(),
        cancelledAt: null,
        errorMessage: "同時実行数制限（最大1）",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      results: [],
      errors: ["同時実行数制限"],
    }
  }

  const runId = crypto.randomUUID()
  const now = new Date().toISOString()
  const run: BenchmarkRun = {
    id: runId,
    createdBy: input.createdBy,
    status: "running",
    config: input.config,
    tags: input.config.tags,
    memo: input.config.memo,
    estimatedMaxCostUsd: estimateBenchmarkCostUsd(input.config),
    actualCostUsd: 0,
    caseCount: input.config.caseIds.length,
    patternCount: input.config.patterns.length,
    resultCount: 0,
    idempotencyKey: key,
    startedAt: now,
    completedAt: null,
    cancelledAt: null,
    errorMessage: null,
    createdAt: now,
    updatedAt: now,
  }
  setActiveBenchmarkRunId(runId)
  saveBenchmarkRun(run)

  const results: BenchmarkRecord[] = []
  const patterns =
    input.config.patterns.length > 0
      ? input.config.patterns
      : ([
          {
            label: "SC_OFF",
            knowledge: true,
            smartContext: false,
            reviewer: true,
            judge: true,
            template: true,
            reference: false,
            maxImproveRounds: null,
            contextBudget: null,
            model: null,
          },
          {
            label: "SC_ON",
            knowledge: true,
            smartContext: true,
            reviewer: true,
            judge: true,
            template: true,
            reference: false,
            maxImproveRounds: null,
            contextBudget: null,
            model: null,
          },
        ] satisfies BenchmarkPatternConfig[])

  try {
    for (const caseId of input.config.caseIds.slice(
      0,
      BENCHMARK_COST_LIMITS.maxCasesHard,
    )) {
      const caseDef =
        getBenchmarkCase(caseId) ??
        listBenchmarkCases().find((c) => c.id === caseId)
      if (!caseDef) continue

      for (const pattern of patterns.slice(
        0,
        BENCHMARK_COST_LIMITS.maxPatternsHard,
      )) {
        const repeats = Math.min(
          Math.max(1, input.config.repeats),
          BENCHMARK_COST_LIMITS.maxRepeatsHard,
        )
        for (let i = 0; i < repeats; i++) {
          const ctx = measureContextForPattern({
            promptKind: caseDef.artifactType as QualityPromptKind,
            request: caseDef.request,
            smartContext: pattern.smartContext,
            knowledge: pattern.knowledge,
          })

          // Fixture text for rule eval only (not a generated artifact body)
          const fixtureContent = [
            caseDef.request,
            ...caseDef.expectedSections.map((s) => `## ${s}`),
            ...caseDef.requiredFacts,
            "敬具",
          ].join("\n\n")

          const ruleEvaluation = evaluateWithRules({
            content: fixtureContent,
            promptKind: caseDef.artifactType,
            caseDef,
            companyName: caseDef.requiredFacts.find((f) => /株式会社/.test(f)),
          })

          const versions = buildVersionSnapshot({
            templateVersion: caseDef.templateId,
            model: pattern.model,
          })

          const record: BenchmarkRecord = {
            id: crypto.randomUUID(),
            runId,
            caseId: caseDef.id,
            artifactId: null,
            jobId: null,
            userId: null,
            organizationId: "benchmark",
            artifactType: caseDef.artifactType,
            artifactSubType: caseDef.name,
            title: `${caseDef.name} / ${pattern.label}`,
            model: pattern.model,
            status: "completed",
            patternLabel: pattern.label,
            featureFlags: {
              qualityEngine: true,
              smartContext: pattern.smartContext,
              knowledge: pattern.knowledge,
              reference: pattern.reference,
              template: pattern.template,
              cache: ctx.cacheHit,
              reviewer: pattern.reviewer,
              judge: pattern.judge,
            },
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
              ...emptyQuality(),
              // Rule score only — not a fake Judge score
              qualityScore: null,
              informationSufficiencyScore: null,
            },
            processing: {
              writerCalls: 0,
              reviewerCalls: 0,
              judgeCalls: 0,
              improvementCount: 0,
              retryCount: 0,
              totalAiCalls: 0,
              extraLlmCalls: ctx.extraLlmCalls,
              processingTimeMs: null,
              queueTimeMs: null,
              generationTimeMs: null,
            },
            contextInfo: {
              contextCandidateCount: ctx.candidateCount,
              contextSelectedCount: ctx.selectedCount,
              contextExcludedCount: ctx.excludedCount,
              contextRequiredCount: ctx.requiredCount,
              contextBudget: ctx.budget,
              estimatedContextTokens: ctx.estimatedTokens,
              actualInputTokens: null,
              outputTokens: null,
              cachedContext: ctx.cacheHit,
              compressionBeforeSize: ctx.before,
              compressionAfterSize: ctx.after,
              compressionRate: ctx.rate,
              knowledgeCount: pattern.knowledge ? ctx.selectedCount : 0,
              referenceCount: pattern.reference ? 1 : 0,
              pastArtifactCount: null,
            },
            costInfo: {
              inputCost: null,
              outputCost: null,
              visionCost: null,
              researchCost: null,
              totalApiCost: 0,
              estimatedCost: 0,
              currency: "USD",
            },
            usageInfo: emptyUsage(),
            ruleEvaluation,
            ownerEvaluation: null,
            userEvaluation: null,
            knowledgeFingerprint: pattern.knowledge ? "bench-know-v1" : null,
            contextFingerprint: `${pattern.smartContext}:${ctx.estimatedTokens}`,
            referenceFingerprint: pattern.reference ? "bench-ref" : null,
            templateId: caseDef.templateId,
            businessProfileVersion: caseDef.businessProfileId,
            createdAt: new Date().toISOString(),
            completedAt: new Date().toISOString(),
            contentExcerpt: null,
          }

          upsertBenchmarkRecord(record)
          results.push(record)
        }
      }
    }

    const completed: BenchmarkRun = {
      ...run,
      status: "completed",
      resultCount: results.length,
      actualCostUsd: 0,
      completedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    }
    saveBenchmarkRun(completed)
    return { run: completed, results, errors: [] }
  } finally {
    setActiveBenchmarkRunId(null)
  }
}

export function cancelBenchmarkRun(runId: string): boolean {
  const run = getBenchmarkRun(runId)
  if (!run || run.status !== "running") return false
  saveBenchmarkRun({
    ...run,
    status: "cancelled",
    cancelledAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  })
  setActiveBenchmarkRunId(null)
  return true
}
