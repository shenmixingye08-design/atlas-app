import { describe, expect, it, beforeEach } from "vitest";

import {
  QUALITY_ENGINE_VERSION,
  WRITER_PROMPT_VERSION,
  assertOwnerCanRunBenchmark,
  assertSafeExportPayload,
  buildVersionSnapshot,
  canReadUserFeedback,
  compareBenchmarkRecords,
  createAndExecuteBenchmarkRun,
  detectQualityRegressions,
  evaluateWithRules,
  exportBenchmarkCsv,
  exportBenchmarkJson,
  listBenchmarkRecords,
  pairSmartContextAb,
  recordBenchmarkFromEngine,
  resetBenchmarkStoreForTests,
  saveFeedback,
  listFeedbackForUser,
  updateBenchmarkRecord,
  validateBenchmarkRunConfig,
  BENCHMARK_COST_LIMITS,
} from "@/lib/quality-engine/benchmark";
import type { QualityEngineTelemetry } from "@/lib/quality-engine/types";

function baseTelemetry(
  overrides: Partial<QualityEngineTelemetry> = {},
): QualityEngineTelemetry {
  return {
    tier: "enhanced",
    promptKind: "sales_material",
    specialistLabel: "営業資料AI",
    improveCount: 1,
    reviewerCount: 1,
    finalScore: 88,
    judgeFocus: "営業力",
    passed: true,
    timings: {
      plannerMs: 10,
      writerMs: 20,
      reviewerMs: 5,
      judgeMs: 5,
      formatterMs: 1,
      improveMs: 8,
    },
    reviewerUsedLlm: false,
    judgeSource: "rules",
    knowledgeUsage: {
      businessProfile: true,
      reference: true,
      template: true,
      knowledge: true,
      contextChars: 1200,
      layersUsed: ["business_profile", "reference"],
      entryCount: 4,
    },
    smartContext: {
      candidateCount: 10,
      selectedCount: 6,
      excludedCount: 4,
      requiredCount: 2,
      budgetTokens: 12000,
      estimatedInputTokens: 900,
      preCompressChars: 4000,
      postCompressChars: 2800,
      reductionRate: 30,
      usedCategories: ["business_profile"],
      usedLayers: ["business_profile"],
      usedReferenceCount: 1,
      usedTemplate: true,
      usedPastArtifactCount: 0,
      cacheHit: false,
      selectionMs: 3,
      extraLlmCalls: 0,
      refillUsed: false,
      actualInputTokens: 1000,
      outputTokens: 400,
      aiCallCount: 2,
      model: "gpt-test",
      estimatedApiCostUsd: 0.012,
      knowledgeEntryCount: 6,
      referenceCount: 1,
      qualityScore: 88,
      improveCount: 1,
    },
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe("Quality Benchmark Phase5", () => {
  beforeEach(() => {
    resetBenchmarkStoreForTests();
  });

  it("1. saves a Benchmark Record after engine telemetry", () => {
    const record = recordBenchmarkFromEngine({
      telemetry: baseTelemetry(),
      judge: {
        overallScore: 88,
        criteria: {
          completeness: 90,
          readability: 85,
          persuasiveness: 80,
          naturalness: 86,
          expertise: 88,
          design: 70,
          structure: 84,
          information: 82,
        },
        legacyCriteria: {
          accuracy: 85,
          completeness: 90,
          logic: 82,
          readability: 85,
          professionalism: 87,
          visualStructure: 77,
        },
        focus: "営業力",
        passed: true,
        feedback: "ok",
        weakSections: [],
        source: "rules",
        durationMs: 1,
      },
      reviewer: null,
      deliverableContent: "## 課題\n\n## 解決\n\nCTA お問い合わせ",
      deliverableTitle: "提案",
      artifactId: "art-1",
      userId: "u1",
    });
    expect(listBenchmarkRecords()).toHaveLength(1);
    expect(record.id).toBeTruthy();
    expect(record.artifactId).toBe("art-1");
  });

  it("2. distinguishes null (unmeasured) from 0", () => {
    const record = recordBenchmarkFromEngine({
      telemetry: baseTelemetry({
        smartContext: {
          ...baseTelemetry().smartContext!,
          estimatedApiCostUsd: null,
          actualInputTokens: 0,
          outputTokens: 0,
        },
      }),
      judge: {
        overallScore: 70,
        criteria: {
          completeness: 70,
          readability: 70,
          persuasiveness: 70,
          naturalness: 70,
          expertise: 70,
          design: 70,
          structure: 70,
          information: 70,
        },
        legacyCriteria: {
          accuracy: 70,
          completeness: 70,
          logic: 70,
          readability: 70,
          professionalism: 70,
          visualStructure: 70,
        },
        focus: "x",
        passed: false,
        feedback: "情報不足",
        weakSections: [],
        source: "rules",
        durationMs: 1,
      },
      reviewer: null,
    });
    expect(record.costInfo.totalApiCost).toBeNull();
    expect(record.contextInfo.actualInputTokens).toBe(0);
    expect(record.usageInfo.downloadCount).toBeNull();
  });

  it("3. creates A/B comparison from same input patterns", () => {
    const { results, errors } = createAndExecuteBenchmarkRun({
      createdBy: "owner@example.com",
      config: {
        artifactTypes: ["sales_material"],
        caseIds: ["case-sales-landowner"],
        patterns: [
          {
            label: "A",
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
            label: "B",
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
        ],
        repeats: 1,
        tags: [],
        memo: "ab",
        executeGeneration: false,
        aiReevaluate: false,
      },
    });
    expect(errors).toEqual([]);
    expect(results.length).toBe(2);
    const cmp = compareBenchmarkRecords(results[0], results[1]);
    expect(cmp.recordAId).toBe(results[0].id);
    expect(cmp.inputTokenDelta === null || typeof cmp.inputTokenDelta === "number").toBe(
      true,
    );
  });

  it("4. compares Smart Context ON/OFF", () => {
    createAndExecuteBenchmarkRun({
      createdBy: "owner@example.com",
      config: {
        artifactTypes: [],
        caseIds: ["case-blog-seo"],
        patterns: [
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
        ],
        repeats: 1,
        tags: [],
        memo: "",
        executeGeneration: false,
        aiReevaluate: false,
      },
    });
    const pairs = pairSmartContextAb(listBenchmarkRecords());
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    const on = listBenchmarkRecords().find((r) => r.featureFlags.smartContext);
    const off = listBenchmarkRecords().find((r) => !r.featureFlags.smartContext);
    expect(on && off).toBeTruthy();
    expect((on!.contextInfo.contextSelectedCount ?? 0)).toBeLessThanOrEqual(
      off!.contextInfo.contextSelectedCount ?? 9999,
    );
  });

  it("5. stores Quality Engine Version", () => {
    const record = recordBenchmarkFromEngine({
      telemetry: baseTelemetry(),
      judge: {
        overallScore: 80,
        criteria: {
          completeness: 80,
          readability: 80,
          persuasiveness: 80,
          naturalness: 80,
          expertise: 80,
          design: 80,
          structure: 80,
          information: 80,
        },
        legacyCriteria: {
          accuracy: 80,
          completeness: 80,
          logic: 80,
          readability: 80,
          professionalism: 80,
          visualStructure: 80,
        },
        focus: "x",
        passed: true,
        feedback: "ok",
        weakSections: [],
        source: "rules",
        durationMs: 1,
      },
      reviewer: null,
    });
    expect(record.versions.qualityEngineVersion).toBe(QUALITY_ENGINE_VERSION);
    expect(buildVersionSnapshot().qualityEngineVersion).toBe("5.0.0");
  });

  it("6. stores Prompt Version", () => {
    const versions = buildVersionSnapshot();
    expect(versions.writerPromptVersion).toBe(WRITER_PROMPT_VERSION);
    const record = recordBenchmarkFromEngine({
      telemetry: baseTelemetry(),
      judge: {
        overallScore: 80,
        criteria: {
          completeness: 80,
          readability: 80,
          persuasiveness: 80,
          naturalness: 80,
          expertise: 80,
          design: 80,
          structure: 80,
          information: 80,
        },
        legacyCriteria: {
          accuracy: 80,
          completeness: 80,
          logic: 80,
          readability: 80,
          professionalism: 80,
          visualStructure: 80,
        },
        focus: "x",
        passed: true,
        feedback: "ok",
        weakSections: [],
        source: "rules",
        durationMs: 1,
      },
      reviewer: null,
    });
    expect(record.versions.writerPromptVersion).toBe(WRITER_PROMPT_VERSION);
  });

  it("7. rule evaluator runs without LLM", () => {
    const result = evaluateWithRules({
      content: "## 課題\n本文\n## 解決\n本文\nCTA お問い合わせ\n株式会社サンプル",
      promptKind: "sales_material",
      companyName: "株式会社サンプル",
    });
    expect(result.score).toBeGreaterThan(0);
    expect(result.checks.length).toBeGreaterThan(0);
  });

  it("8. detects missing required headings", () => {
    const result = evaluateWithRules({
      content: "本文だけ",
      promptKind: "sales_material",
      caseDef: {
        expectedSections: ["課題", "解決", "CTA"],
        requiredFacts: [],
        prohibitedExpressions: [],
        expectedAudience: null,
        requiredOutputFormat: null,
      },
    });
    expect(result.issues.some((i) => i.code === "missing_section")).toBe(true);
  });

  it("9. detects prohibited expressions", () => {
    const result = evaluateWithRules({
      content: "この案件は絶対儲かる投資です",
      promptKind: "blog",
      caseDef: {
        expectedSections: [],
        requiredFacts: [],
        prohibitedExpressions: ["絶対儲かる"],
        expectedAudience: null,
        requiredOutputFormat: null,
      },
    });
    expect(result.issues.some((i) => i.code === "prohibited_expression")).toBe(
      true,
    );
  });

  it("10. detects missing required numbers/facts", () => {
    const result = evaluateWithRules({
      content: "提案資料です",
      promptKind: "sales_material",
      caseDef: {
        expectedSections: [],
        requiredFacts: ["120万円"],
        prohibitedExpressions: [],
        expectedAudience: null,
        requiredOutputFormat: null,
      },
    });
    expect(result.issues.some((i) => i.code === "missing_fact")).toBe(true);
  });

  it("11. stores owner evaluation", () => {
    const record = recordBenchmarkFromEngine({
      telemetry: baseTelemetry(),
      judge: {
        overallScore: 80,
        criteria: {
          completeness: 80,
          readability: 80,
          persuasiveness: 80,
          naturalness: 80,
          expertise: 80,
          design: 80,
          structure: 80,
          information: 80,
        },
        legacyCriteria: {
          accuracy: 80,
          completeness: 80,
          logic: 80,
          readability: 80,
          professionalism: 80,
          visualStructure: 80,
        },
        focus: "x",
        passed: true,
        feedback: "ok",
        weakSections: [],
        source: "rules",
        durationMs: 1,
      },
      reviewer: null,
    });
    const updated = updateBenchmarkRecord(record.id, {
      ownerEvaluation: {
        overall: 92,
        accuracy: 90,
        information: 88,
        persuasiveness: 91,
        readability: 90,
        appearance: 85,
        brandFit: 90,
        lowEditNeed: 88,
        practicalUse: 93,
        betterThanChatGpt: 80,
        usability: "ready",
        pros: "明確",
        cons: "",
        missingInfo: "",
        unnecessaryInfo: "",
        nextImprovements: "",
        ratedAt: new Date().toISOString(),
        ratedBy: "owner",
      },
    });
    expect(updated?.ownerEvaluation?.overall).toBe(92);
  });

  it("12. users cannot read others' feedback", () => {
    saveFeedback({
      artifactId: "a1",
      userId: "user-a",
      role: "user",
      payload: {
        label: "good",
        score: 80,
        reasons: [],
        otherText: null,
        ratedAt: new Date().toISOString(),
      },
    });
    expect(listFeedbackForUser("user-b")).toHaveLength(0);
    expect(
      canReadUserFeedback({
        viewerUserId: "user-b",
        feedbackUserId: "user-a",
        isOwner: false,
      }),
    ).toBe(false);
  });

  it("13. non-owners cannot run benchmark", () => {
    expect(() => assertOwnerCanRunBenchmark(false)).toThrow(/owner only/);
    expect(() => assertOwnerCanRunBenchmark(true)).not.toThrow();
  });

  it("14. rejects runs exceeding max case count", () => {
    const tooMany = Array.from(
      { length: BENCHMARK_COST_LIMITS.maxCasesHard + 1 },
      (_, i) => `case-${i}`,
    );
    const v = validateBenchmarkRunConfig({
      artifactTypes: [],
      caseIds: tooMany,
      patterns: [
        {
          label: "A",
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
      ],
      repeats: 1,
      tags: [],
      memo: "",
      executeGeneration: false,
      aiReevaluate: false,
    });
    expect(v.ok).toBe(false);
    expect(v.errors.some((e) => /最大実行件数/.test(e))).toBe(true);
  });

  it("15. prevents duplicate benchmark runs", () => {
    const config = {
      artifactTypes: [] as string[],
      caseIds: ["case-email-thanks"],
      patterns: [
        {
          label: "A",
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
      ],
      repeats: 1,
      tags: [] as string[],
      memo: "dup",
      executeGeneration: false,
      aiReevaluate: false,
    };
    const first = createAndExecuteBenchmarkRun({
      createdBy: "owner@example.com",
      config,
    });
    expect(first.run.status).toBe("completed");
    const second = createAndExecuteBenchmarkRun({
      createdBy: "owner@example.com",
      config,
    });
    expect(second.errors.some((e) => /重複/.test(e))).toBe(true);
  });

  it("16. does not assert regression with insufficient data", () => {
    const signals = detectQualityRegressions([
      recordBenchmarkFromEngine({
        telemetry: baseTelemetry(),
        judge: {
          overallScore: 80,
          criteria: {
            completeness: 80,
            readability: 80,
            persuasiveness: 80,
            naturalness: 80,
            expertise: 80,
            design: 80,
            structure: 80,
            information: 80,
          },
          legacyCriteria: {
            accuracy: 80,
            completeness: 80,
            logic: 80,
            readability: 80,
            professionalism: 80,
            visualStructure: 80,
          },
          focus: "x",
          passed: true,
          feedback: "ok",
          weakSections: [],
          source: "rules",
          durationMs: 1,
        },
        reviewer: null,
      }),
    ]);
    expect(signals[0]?.status).toBe("insufficient_data");
    expect(signals[0]?.message).toContain("データ不足");
  });

  it("17. does not invent fake overview metrics when empty", async () => {
    const { buildBenchmarkOverview } = await import("./overview");
    const overview = buildBenchmarkOverview([]);
    expect(overview.dataStatus).toBe("insufficient_data");
    expect(overview.avgQualityScore).toBeNull();
    expect(overview.avgApiCost).toBeNull();
  });

  it("18. CSV export excludes body and PII fields", () => {
    recordBenchmarkFromEngine({
      telemetry: baseTelemetry(),
      judge: {
        overallScore: 80,
        criteria: {
          completeness: 80,
          readability: 80,
          persuasiveness: 80,
          naturalness: 80,
          expertise: 80,
          design: 80,
          structure: 80,
          information: 80,
        },
        legacyCriteria: {
          accuracy: 80,
          completeness: 80,
          logic: 80,
          readability: 80,
          professionalism: 80,
          visualStructure: 80,
        },
        focus: "x",
        passed: true,
        feedback: "ok",
        weakSections: [],
        source: "rules",
        durationMs: 1,
      },
      reviewer: null,
      userId: "secret-user",
      deliverableContent: "SECRET_BODY_SHOULD_NOT_EXPORT",
    });
    const csv = exportBenchmarkCsv(listBenchmarkRecords());
    const json = exportBenchmarkJson(listBenchmarkRecords());
    expect(csv).not.toContain("SECRET_BODY");
    expect(csv).not.toContain("secret-user");
    expect(json).not.toContain("SECRET_BODY");
    expect(json).not.toContain("contentExcerpt");
    expect(() => assertSafeExportPayload(json)).not.toThrow();
  });

  it("19. selection / benchmark analyze path keeps extra LLM at 0", () => {
    const { results } = createAndExecuteBenchmarkRun({
      createdBy: "owner@example.com",
      config: {
        artifactTypes: [],
        caseIds: ["case-sns-launch"],
        patterns: [
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
        ],
        repeats: 1,
        tags: [],
        memo: "",
        executeGeneration: false,
        aiReevaluate: false,
      },
    });
    expect(results.every((r) => r.processing.extraLlmCalls === 0)).toBe(true);
    expect(results.every((r) => r.processing.totalAiCalls === 0)).toBe(true);
    expect(
      validateBenchmarkRunConfig({
        artifactTypes: [],
        caseIds: ["case-sns-launch"],
        patterns: [
          {
            label: "X",
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
        ],
        repeats: 1,
        tags: [],
        memo: "",
        executeGeneration: true,
        aiReevaluate: false,
      }).ok,
    ).toBe(false);
  });

  it("20. existing quality engine policy constants remain intact", async () => {
    const { QUALITY_ENGINE_MAX_IMPROVE } = await import(
      "@/lib/quality-engine/policy"
    );
    expect(QUALITY_ENGINE_MAX_IMPROVE).toBe(2);
  });
});
