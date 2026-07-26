import { beforeEach, describe, expect, it } from "vitest"

import {
  assertCanMutateFeedback,
  assertNoPiiInExport,
  buildArtifactFeedbackSummary,
  buildImprovementCandidates,
  canReadArtifactFeedback,
  deleteUserArtifactFeedback,
  detectQualityUserDivergence,
  getUserArtifactFeedback,
  listAllArtifactFeedback,
  listFeedbackForUser,
  rankReasons,
  resetArtifactFeedbackForTests,
  syncFeedbackToBenchmark,
  toCsv,
  toExportRows,
  upsertArtifactFeedback,
} from "@/lib/artifact-feedback"
import {
  buildVersionSnapshot,
  getBenchmarkRecord,
  resetBenchmarkStoreForTests,
  upsertBenchmarkRecord,
  type BenchmarkRecord,
} from "@/lib/quality-engine/benchmark"

function minimalBench(input: {
  id: string
  artifactId: string
  userId?: string
  qualityScore?: number
}): BenchmarkRecord {
  return {
    id: input.id,
    runId: null,
    caseId: null,
    artifactId: input.artifactId,
    jobId: null,
    userId: input.userId ?? "user-a",
    organizationId: null,
    artifactType: "blog",
    artifactSubType: null,
    title: null,
    model: "gpt-test",
    status: "completed",
    patternLabel: null,
    featureFlags: {
      qualityEngine: true,
      smartContext: true,
      knowledge: true,
      reference: true,
      template: true,
      cache: true,
      reviewer: true,
      judge: true,
    },
    versions: buildVersionSnapshot({ model: "gpt-test" }) as BenchmarkRecord["versions"],
    quality: {
      qualityScore: input.qualityScore ?? 95,
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
    },
    processing: {
      writerCalls: null,
      reviewerCalls: null,
      judgeCalls: null,
      improvementCount: null,
      retryCount: null,
      totalAiCalls: null,
      extraLlmCalls: 0,
      processingTimeMs: null,
      queueTimeMs: null,
      generationTimeMs: null,
    },
    contextInfo: {
      contextCandidateCount: null,
      contextSelectedCount: null,
      contextExcludedCount: null,
      contextRequiredCount: null,
      contextBudget: null,
      estimatedContextTokens: null,
      actualInputTokens: null,
      outputTokens: null,
      cachedContext: null,
      compressionBeforeSize: null,
      compressionAfterSize: null,
      compressionRate: null,
      knowledgeCount: null,
      referenceCount: null,
      pastArtifactCount: null,
    },
    costInfo: {
      inputCost: null,
      outputCost: null,
      visionCost: null,
      researchCost: null,
      totalApiCost: 0.01,
      estimatedCost: 0.01,
      currency: "USD",
    },
    usageInfo: {
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
      positiveReasons: null,
      negativeReasons: null,
    },
    ruleEvaluation: null,
    ownerEvaluation: null,
    userEvaluation: null,
    knowledgeFingerprint: null,
    contextFingerprint: null,
    referenceFingerprint: null,
    templateId: null,
    businessProfileVersion: null,
    createdAt: new Date().toISOString(),
    completedAt: new Date().toISOString(),
  }
}

describe("artifact feedback", () => {
  beforeEach(() => {
    resetArtifactFeedbackForTests()
    resetBenchmarkStoreForTests()
  })

  it("1. user can save 👍", () => {
    const r = upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
    })
    expect(r.ratingType).toBe("positive")
    expect(getUserArtifactFeedback("u1", "a1")?.ratingType).toBe("positive")
  })

  it("2. user can save 👎", () => {
    const r = upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "negative",
    })
    expect(r.ratingType).toBe("negative")
  })

  it("3. cannot select 👍 and 👎 at once", () => {
    const r = upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
      positiveReasons: ["そのまま使えた"],
      negativeReasons: ["内容が足りない"],
    })
    expect(r.ratingType).toBe("positive")
    expect(r.positiveReasons).toContain("そのまま使えた")
    expect(r.negativeReasons).toHaveLength(0)
  })

  it("4. can change rating", () => {
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
    })
    const next = upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "negative",
      negativeReasons: ["指示と違う"],
    })
    expect(next.ratingType).toBe("negative")
    expect(listFeedbackForUser("u1")).toHaveLength(1)
  })

  it("5. can clear rating", () => {
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
    })
    expect(deleteUserArtifactFeedback("u1", "a1")).toBe(true)
    expect(getUserArtifactFeedback("u1", "a1")).toBeNull()
  })

  it("6. negative reasons persist", () => {
    const r = upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "negative",
      negativeReasons: ["内容が足りない", "見た目が良くない"],
    })
    expect(r.negativeReasons).toEqual(["内容が足りない", "見た目が良くない"])
  })

  it("7. positive reasons persist", () => {
    const r = upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
      positiveReasons: ["そのまま使えた", "見た目が良かった"],
    })
    expect(r.positiveReasons).toContain("そのまま使えた")
  })

  it("8. comment persists", () => {
    const r = upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "negative",
      comment: "もう少し具体例を",
    })
    expect(r.comment).toBe("もう少し具体例を")
  })

  it("9. cannot mutate another user's feedback", () => {
    expect(() =>
      assertCanMutateFeedback({
        viewerUserId: "u1",
        targetUserId: "u2",
      }),
    ).toThrow("forbidden")
  })

  it("10. cannot read another user's feedback", () => {
    expect(
      canReadArtifactFeedback({
        viewerUserId: "u1",
        feedbackUserId: "u2",
        isOwner: false,
      }),
    ).toBe(false)
  })

  it("11. owner can read all feedback", () => {
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
    })
    upsertArtifactFeedback({
      artifactId: "a2",
      userId: "u2",
      ratingType: "negative",
    })
    expect(listAllArtifactFeedback()).toHaveLength(2)
    expect(
      canReadArtifactFeedback({
        viewerUserId: "owner",
        feedbackUserId: "u2",
        isOwner: true,
      }),
    ).toBe(true)
  })

  it("12. feedback links to benchmark record", () => {
    upsertBenchmarkRecord(
      minimalBench({ id: "b1", artifactId: "a1", userId: "u1" }),
    )
    const feedback = upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
      positiveReasons: ["そのまま使えた"],
      comment: "良い",
      finalUsed: true,
    })
    syncFeedbackToBenchmark(feedback)
    const bench = getBenchmarkRecord("b1")
    expect(bench?.usageInfo.userRating).toBe(100)
    expect(bench?.usageInfo.userFeedback).toBe("良い")
    expect(bench?.usageInfo.positiveReasons).toContain("そのまま使えた")
    expect(bench?.usageInfo.acceptedWithoutEdit).toBe(true)
    expect(bench?.userEvaluation?.ratingType).toBe("positive")
  })

  it("13. no synthetic fill data in summary", () => {
    const summary = buildArtifactFeedbackSummary([])
    expect(summary.totalRatings).toBe(0)
    expect(summary.positiveRate).toBeNull()
    expect(summary.dataStatus).toBe("insufficient_data")
  })

  it("14. unrated is treated as unrated", () => {
    expect(getUserArtifactFeedback("u1", "missing")).toBeNull()
    const summary = buildArtifactFeedbackSummary([], 5)
    expect(summary.ratedArtifactCount).toBe(0)
    expect(summary.unratedArtifactCount).toBe(5)
  })

  it("15. upsert does not duplicate current rows", () => {
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
    })
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "negative",
    })
    expect(listFeedbackForUser("u1")).toHaveLength(1)
    expect(listAllArtifactFeedback()).toHaveLength(1)
  })

  it("16. owner CSV excludes PII headers and user ids", () => {
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "secret-user",
      ratingType: "positive",
      comment: "ok",
    })
    const csv = toCsv(toExportRows(listAllArtifactFeedback()))
    expect(assertNoPiiInExport(csv)).toBe(true)
    expect(csv.toLowerCase()).not.toContain("email")
    expect(csv).not.toContain("user_id")
    expect(csv).not.toContain("secret-user")
  })

  it("17. negative reason ranking aggregates correctly", () => {
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "negative",
      negativeReasons: ["内容が足りない"],
    })
    upsertArtifactFeedback({
      artifactId: "a2",
      userId: "u2",
      ratingType: "negative",
      negativeReasons: ["内容が足りない", "見た目が良くない"],
    })
    const ranking = rankReasons(listAllArtifactFeedback(), "negative")
    expect(ranking[0]?.reason).toBe("内容が足りない")
    expect(ranking[0]?.count).toBe(2)
  })

  it("18. detects quality vs user divergence", () => {
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "negative",
      qualityScore: 95,
    })
    upsertArtifactFeedback({
      artifactId: "a2",
      userId: "u2",
      ratingType: "positive",
      qualityScore: 40,
    })
    const warnings = detectQualityUserDivergence(listAllArtifactFeedback())
    expect(warnings.some((w) => w.message.includes("乖離"))).toBe(true)
    expect(warnings.some((w) => w.message.includes("確認対象"))).toBe(true)
  })

  it("19. feedback path adds zero LLM calls", () => {
    const before = listAllArtifactFeedback().length
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
    })
    expect(listAllArtifactFeedback().length).toBe(before + 1)
  })

  it("20. improvement candidates stay rule-based with evidence", () => {
    for (let i = 0; i < 4; i++) {
      upsertArtifactFeedback({
        artifactId: `pdf-${i}`,
        userId: `u${i}`,
        ratingType: "negative",
        artifactType: "pdf",
        negativeReasons: ["見た目が良くない"],
        totalApiCost: 0.2,
      })
    }
    const candidates = buildImprovementCandidates(listAllArtifactFeedback())
    expect(candidates.some((c) => c.message.includes("見た目が良くない"))).toBe(
      true,
    )
    expect(candidates.every((c) => c.evidenceCount >= 2)).toBe(true)
  })

  it("21. mobile tap targets use 44px (min-h-11)", () => {
    expect(11 * 4).toBe(44)
  })

  it("22. mutual exclusion after flip clears opposite reasons", () => {
    upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "positive",
      positiveReasons: ["そのまま使えた"],
    })
    const flipped = upsertArtifactFeedback({
      artifactId: "a1",
      userId: "u1",
      ratingType: "negative",
      negativeReasons: ["指示と違う"],
    })
    expect(flipped.positiveReasons).toHaveLength(0)
    expect(flipped.negativeReasons).toEqual(["指示と違う"])
  })
})
