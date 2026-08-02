import { describe, expect, it, beforeEach } from "vitest";

import {
  applyContentPersonalization,
  applyOcrPersonalization,
  applyVisionSummaryPersonalization,
  buildArtifactGeneratorOptions,
} from "@/lib/personalization/apply-artifact";
import { buildPersonalizationContext } from "@/lib/personalization/context-builder";
import {
  compareMemoryOnOff,
  runMemoryLearningLoop,
  runOcrVisionPersonalizationDemo,
} from "@/lib/personalization/experiment";
import { computeQualityMetrics } from "@/lib/personalization/metrics";
import { resolveMemoryPriority } from "@/lib/personalization/priority";
import {
  USER_FACING_PREDICTION_LABEL,
  classifyPredictionType,
} from "@/lib/personalization/prediction";
import {
  PROMOTION_MIN_CONFIDENCE,
  PROMOTION_MIN_EVIDENCE,
  bumpEvidence,
  createCandidateMemory,
  disableMemory,
  evaluatePromotion,
  promoteCandidate,
  rejectCandidate,
  rollbackMemoryVersion,
  softDeleteMemory,
} from "@/lib/personalization/promotion";
import {
  computeDiffMetrics,
  preferenceMatchScore,
} from "@/lib/personalization/structural-diff";
import {
  appendGenerationRecord,
  listGenerationRecords,
  listProductionMemories,
  resetProductionMemoryStoreForTests,
  upsertProductionMemory,
} from "@/lib/personalization/store";
import type { ProductionMemoryRecord } from "@/lib/personalization/types";
import { DocxDeliverableGenerator } from "@/lib/deliverables/generators/docx-generator";
import { PdfDeliverableGenerator } from "@/lib/deliverables/generators/pdf-generator";
import { PptxDeliverableGenerator } from "@/lib/deliverables/generators/pptx-generator";
import { XlsxDeliverableGenerator } from "@/lib/deliverables/generators/xlsx-generator";

function activeMemory(
  partial: Partial<ProductionMemoryRecord> &
    Pick<ProductionMemoryRecord, "ownerId" | "key" | "scopeType">,
): ProductionMemoryRecord {
  const base = createCandidateMemory({
    ownerId: partial.ownerId,
    key: partial.key,
    normalizedValue: partial.normalizedValue ?? { [partial.key]: "v" },
    title: partial.title ?? partial.key,
    summary: partial.summary ?? partial.key,
    scopeType: partial.scopeType,
    scopeId: partial.scopeId,
    category: partial.category,
    artifactType: partial.artifactType,
    confidence: partial.confidence ?? 0.9,
    evidenceCount: partial.evidenceCount ?? 3,
  });
  return {
    ...base,
    ...partial,
    candidateStatus: "active",
    confidence: partial.confidence ?? 0.9,
    evidenceCount: partial.evidenceCount ?? 3,
    approvedAt: partial.highImpact ? new Date().toISOString() : null,
  };
}

beforeEach(() => {
  resetProductionMemoryStoreForTests();
});

describe("Memory priority resolution", () => {
  it("1. Global Memory applies when no higher scope", () => {
    const result = resolveMemoryPriority({
      ownerId: "u1",
      memories: [
        activeMemory({
          ownerId: "u1",
          key: "verbosity",
          scopeType: "global",
          normalizedValue: { verbosity: "short" },
        }),
      ],
    });
    expect(result.values.verbosity).toBe("short");
    expect(result.resolved[0]?.layer).toBe("global");
  });

  it("2. Company Memory beats global", () => {
    const result = resolveMemoryPriority({
      ownerId: "u1",
      companyId: "c1",
      memories: [
        activeMemory({
          ownerId: "u1",
          key: "tone",
          scopeType: "global",
          normalizedValue: { tone: "casual" },
        }),
        activeMemory({
          ownerId: "u1",
          key: "tone",
          scopeType: "company",
          scopeId: "c1",
          normalizedValue: { tone: "formal" },
        }),
      ],
    });
    expect(result.values.tone).toBe("formal");
  });

  it("3. Category Memory beats artifact/global", () => {
    const result = resolveMemoryPriority({
      ownerId: "u1",
      category: "営業レポート",
      artifactType: "docx",
      memories: [
        activeMemory({
          ownerId: "u1",
          key: "bulletUsage",
          scopeType: "artifactType",
          scopeId: "docx",
          normalizedValue: { bulletUsage: "avoid" },
        }),
        activeMemory({
          ownerId: "u1",
          key: "bulletUsage",
          scopeType: "workCategory",
          scopeId: "営業レポート",
          category: "営業レポート",
          normalizedValue: { bulletUsage: "prefer" },
        }),
      ],
    });
    expect(result.values.bulletUsage).toBe("prefer");
  });

  it("4. Artifact Memory applies for matching type", () => {
    const result = resolveMemoryPriority({
      ownerId: "u1",
      artifactType: "pptx",
      memories: [
        activeMemory({
          ownerId: "u1",
          key: "aspectRatio",
          scopeType: "artifactType",
          scopeId: "pptx",
          artifactType: "pptx",
          normalizedValue: { aspectRatio: "16:9" },
        }),
      ],
    });
    expect(result.values.aspectRatio).toBe("16:9");
  });

  it("5. Automation Memory beats template/company", () => {
    const result = resolveMemoryPriority({
      ownerId: "u1",
      automationId: "auto1",
      templateId: "tpl1",
      companyId: "c1",
      memories: [
        activeMemory({
          ownerId: "u1",
          key: "verbosity",
          scopeType: "company",
          scopeId: "c1",
          normalizedValue: { verbosity: "long" },
        }),
        activeMemory({
          ownerId: "u1",
          key: "verbosity",
          scopeType: "template",
          scopeId: "tpl1",
          normalizedValue: { verbosity: "medium" },
        }),
        activeMemory({
          ownerId: "u1",
          key: "verbosity",
          scopeType: "automation",
          scopeId: "auto1",
          normalizedValue: { verbosity: "short" },
        }),
      ],
    });
    expect(result.values.verbosity).toBe("short");
  });

  it("6. Template Memory beats company", () => {
    const result = resolveMemoryPriority({
      ownerId: "u1",
      templateId: "tpl1",
      companyId: "c1",
      memories: [
        activeMemory({
          ownerId: "u1",
          key: "colorPalette",
          scopeType: "company",
          scopeId: "c1",
          normalizedValue: { colorPalette: "red" },
        }),
        activeMemory({
          ownerId: "u1",
          key: "colorPalette",
          scopeType: "template",
          scopeId: "tpl1",
          normalizedValue: { colorPalette: "blue" },
        }),
      ],
    });
    expect(result.values.colorPalette).toBe("blue");
  });

  it("7. Priority order explicit > automation > … > global", () => {
    const result = resolveMemoryPriority({
      ownerId: "u1",
      automationId: "a1",
      explicitOverrides: { tone: "polite" },
      memories: [
        activeMemory({
          ownerId: "u1",
          key: "tone",
          scopeType: "automation",
          scopeId: "a1",
          normalizedValue: { tone: "casual" },
        }),
      ],
    });
    expect(result.values.tone).toBe("polite");
    expect(result.resolved.find((r) => r.layer === "explicit")).toBeTruthy();
  });

  it("8. Conflict ask_user when same rank unresolvable", () => {
    const now = new Date().toISOString();
    const a = activeMemory({
      ownerId: "u1",
      key: "tone",
      scopeType: "global",
      normalizedValue: { tone: "formal" },
      confidence: 0.9,
      evidenceCount: 3,
      updatedAt: now,
    });
    const b = activeMemory({
      ownerId: "u1",
      key: "tone",
      scopeType: "global",
      normalizedValue: { tone: "casual" },
      confidence: 0.9,
      evidenceCount: 3,
      updatedAt: now,
    });
    const result = resolveMemoryPriority({
      ownerId: "u1",
      memories: [a, b],
    });
    expect(result.requiresConfirmation).toBe(true);
    expect(result.values.tone).toBeUndefined();
  });

  it("9. Explicit override wins over all memory", () => {
    const ctx = buildPersonalizationContext({
      ownerId: "u1",
      explicitOverrides: { verbosity: "long" },
      memories: [
        activeMemory({
          ownerId: "u1",
          key: "verbosity",
          scopeType: "automation",
          scopeId: "a1",
          normalizedValue: { verbosity: "short" },
        }),
      ],
      automationId: "a1",
    });
    expect(ctx.writingStyle.verbosity).toBe("long");
    expect(ctx.explicitOverrides.verbosity).toBe("long");
  });
});

describe("Candidate / promotion / rejection / disable / delete / rollback / version", () => {
  it("10-12. Candidate needs evidence>=3 and confidence>=0.8; no one-shot", () => {
    let mem = createCandidateMemory({
      ownerId: "u1",
      key: "verbosity",
      normalizedValue: { verbosity: "short" },
      title: "短め",
      summary: "短め",
      scopeType: "global",
      evidenceCount: 1,
      confidence: 0.55,
    });
    expect(evaluatePromotion(mem).canPromote).toBe(false);
    mem = bumpEvidence(mem, 1);
    expect(evaluatePromotion(mem).canPromote).toBe(false);
    mem = bumpEvidence(mem, 1);
    // evidence 3, confidence 0.75
    expect(mem.evidenceCount).toBe(PROMOTION_MIN_EVIDENCE);
    expect(mem.confidence).toBeLessThan(PROMOTION_MIN_CONFIDENCE);
    expect(evaluatePromotion(mem).canPromote).toBe(false);
    mem = bumpEvidence(mem, 1);
    expect(mem.confidence).toBeGreaterThanOrEqual(PROMOTION_MIN_CONFIDENCE);
    const promoted = promoteCandidate(mem);
    expect(promoted.candidateStatus).toBe("active");
    expect(promoted.version).toBe(mem.version + 1);
  });

  it("13-15. Rejection, disable, delete", () => {
    const mem = createCandidateMemory({
      ownerId: "u1",
      key: "tone",
      normalizedValue: { tone: "polite" },
      title: "丁寧",
      summary: "丁寧",
      scopeType: "global",
    });
    expect(rejectCandidate(mem).candidateStatus).toBe("rejected");
    expect(disableMemory(mem).candidateStatus).toBe("disabled");
    expect(softDeleteMemory(mem).candidateStatus).toBe("deleted");
  });

  it("16. Rollback restores previous version payload", () => {
    const prev = activeMemory({
      ownerId: "u1",
      key: "tone",
      scopeType: "global",
      normalizedValue: { tone: "formal" },
      version: 1,
    });
    const current = { ...prev, normalizedValue: { tone: "casual" }, version: 2 };
    const rolled = rollbackMemoryVersion(current, prev);
    expect(rolled.normalizedValue.tone).toBe("formal");
    expect(rolled.version).toBe(3);
  });
});

describe("Artifact-specific application", () => {
  const longContent = [
    "# 営業レポート",
    "",
    "今月の状況について詳細に説明する。文章は長く、要点が埋もれがちである。改善が必要である。",
    "",
    "顧客対応と提案内容のばらつきが大きい状況である。",
  ].join("\n");

  it("17. Word reflects verbosity/headings and produces real docx", async () => {
    const verbose = [
      "# 営業レポート",
      "",
      "今月の営業活動について報告する。全体として受注は前月比で改善傾向にあるが、提案資料の粒度にばらつきがある。顧客ごとのフォロー状況も担当者によって差が大きく、標準化が求められる状況である。重点顧客への訪問は継続している。",
      "",
      "来月は新規開拓と既存深耕のバランスを見直す予定である。追加の説明も長文で続ける必要がある場面があるが今回は削減対象とする。",
    ].join("\n");
    const ctx = buildPersonalizationContext({
      ownerId: "u1",
      memories: [],
      explicitOverrides: {
        verbosity: "short",
        headingDensity: "high",
        bulletUsage: "prefer",
        fileNamePattern: "{title}_{date}",
      },
      memoryEnabled: false,
    });
    const content = applyContentPersonalization(verbose, {
      ...ctx,
      writingStyle: {
        verbosity: "short",
        headingDensity: "high",
        bulletUsage: "prefer",
      },
    });
    const file = await new DocxDeliverableGenerator().generate(
      content,
      "sales-report",
      { title: "営業レポート", footerNote: "簡潔版" },
    );
    expect(file.buffer[0]).toBe(0x50);
    expect(file.buffer[1]).toBe(0x4b);
    expect(file.buffer.byteLength).toBeGreaterThan(1500);
    expect(content.length).toBeLessThan(verbose.length);
  });

  it("18. Excel reflects freeze/filter/color/filename", async () => {
    const opts = buildArtifactGeneratorOptions(
      buildPersonalizationContext({
        ownerId: "u1",
        memories: [],
        explicitOverrides: {
          freezePane: true,
          autoFilter: true,
          colorPalette: "blue",
          columnOrder: ["日付", "店舗", "金額"],
          fileNamePattern: "{title}_{date}",
        },
        memoryEnabled: false,
      }),
    );
    const content = [
      "| 店舗 | 日付 | 金額 |",
      "| --- | --- | --- |",
      "| A | 2026/8/1 | 1000 |",
    ].join("\n");
    const file = await new XlsxDeliverableGenerator().generate(
      content,
      "receipt",
      opts.excel,
    );
    expect(file.buffer[0]).toBe(0x50);
    expect(file.fileName.endsWith(".xlsx")).toBe(true);
    expect(opts.excel?.freezePane).toBe(true);
    expect(opts.excel?.headerColor).toBe("1F4E79");
  });

  it("19. PDF reflects margins/headerFooter", async () => {
    const file = await new PdfDeliverableGenerator().generate(
      longContent,
      "report",
      { marginsMm: 18, headerFooter: true, pageLayout: "compact" },
    );
    expect(file.buffer.subarray(0, 4).toString("utf8")).toBe("%PDF");
    expect(file.buffer.byteLength).toBeGreaterThan(500);
  });

  it("20. PowerPoint reflects 16:9 and blue", async () => {
    const file = await new PptxDeliverableGenerator().generate(
      longContent,
      "deck",
      { aspectRatio: "16:9", primaryColor: "1F4E79" },
    );
    expect(file.buffer[0]).toBe(0x50);
    expect(file.buffer.byteLength).toBeGreaterThan(1000);
  });

  it("21-22. OCR and Vision personalization", () => {
    const ctx = buildPersonalizationContext({
      ownerId: "u1",
      memories: [],
      explicitOverrides: {
        ocrNormalize: {
          columns: ["日付", "店舗", "金額"],
          dateFormat: "YYYY-MM-DD",
          amountFormat: "yen",
          summaryStyle: "bullets",
        },
      },
      memoryEnabled: false,
    });
    // inject ocr into context manually
    const withOcr = {
      ...ctx,
      artifactPreferences: {
        ocrNormalize: {
          columns: ["日付", "店舗", "金額"],
          dateFormat: "YYYY-MM-DD" as const,
          amountFormat: "yen",
          summaryStyle: "bullets" as const,
        },
      },
    };
    const demo = runOcrVisionPersonalizationDemo(withOcr);
    expect(demo.ocr[0]?.["日付"]).toMatch(/2026-08-01/);
    expect(demo.vision.startsWith("- ")).toBe(true);
    expect(applyOcrPersonalization(demo.ocr, withOcr).length).toBe(2);
    expect(
      applyVisionSummaryPersonalization("要点。詳細。", withOcr),
    ).toContain("- ");
  });
});

describe("Quality metrics & isolation", () => {
  it("23-26. First accept, diff, instruction reduction, false application measured", () => {
    appendGenerationRecord({
      generationId: "g1",
      ownerId: "u1",
      artifactId: "a1",
      category: "営業",
      artifactType: "docx",
      appliedMemoryIds: ["m1"],
      ignoredMemoryIds: [],
      explicitOverrides: {},
      conflictResolutions: [],
      predictedPreferenceIds: [],
      preGenerationScore: 0.5,
      postRevisionScore: 0.9,
      diffMetrics: {
        normalizedDiffRate: 0.5,
        categories: [],
        instructionLength: 200,
        revisionCount: 1,
      },
      firstAccept: false,
      userRating: 3,
      revisionCount: 1,
      revisionDurationMs: 1000,
      memoryEnabled: true,
      createdAt: "2026-08-01T00:00:00.000Z",
      scoreKind: "measured",
    });
    appendGenerationRecord({
      generationId: "g2",
      ownerId: "u1",
      artifactId: "a2",
      category: "営業",
      artifactType: "docx",
      appliedMemoryIds: ["m1"],
      ignoredMemoryIds: [],
      explicitOverrides: { tone: "polite" },
      conflictResolutions: [],
      predictedPreferenceIds: [],
      preGenerationScore: 0.9,
      postRevisionScore: 0.95,
      diffMetrics: {
        normalizedDiffRate: 0.1,
        categories: [],
        instructionLength: 40,
        revisionCount: 0,
      },
      firstAccept: true,
      userRating: 5,
      revisionCount: 0,
      revisionDurationMs: 100,
      memoryEnabled: true,
      createdAt: "2026-08-02T00:00:00.000Z",
      scoreKind: "measured",
    });
    const m = computeQualityMetrics(listGenerationRecords("u1"));
    expect(m.kind).toBe("measured");
    expect(m.firstAcceptRate).toBeGreaterThan(0);
    expect(m.instructionReductionRate).toBeGreaterThan(0);
    expect(m.falseApplicationRate).toBeLessThan(0.05);
    expect(m.overrideRate).toBeGreaterThan(0);
  });

  it("27. Owner isolation — other owner memories never apply", () => {
    const result = resolveMemoryPriority({
      ownerId: "u1",
      memories: [
        activeMemory({
          ownerId: "u2",
          key: "verbosity",
          scopeType: "global",
          normalizedValue: { verbosity: "short" },
        }),
      ],
    });
    expect(result.appliedMemoryIds).toHaveLength(0);
    expect(result.values.verbosity).toBeUndefined();
  });

  it("28. Tenant/company isolation — other company scope ignored", () => {
    const result = resolveMemoryPriority({
      ownerId: "u1",
      companyId: "c1",
      memories: [
        activeMemory({
          ownerId: "u1",
          key: "tone",
          scopeType: "company",
          scopeId: "cOTHER",
          normalizedValue: { tone: "casual" },
        }),
      ],
    });
    expect(result.appliedMemoryIds).toHaveLength(0);
  });
});

describe("Prediction classification", () => {
  it("distinguishes rule/heuristic/statistical/llm and user label", () => {
    expect(
      classifyPredictionType({
        hasStatisticalModel: false,
        usedLlm: false,
        ruleMatched: true,
        heuristicScore: 0.2,
      }),
    ).toBe("deterministic_rule");
    expect(
      classifyPredictionType({
        hasStatisticalModel: false,
        usedLlm: false,
        ruleMatched: true,
        heuristicScore: 0.8,
      }),
    ).toBe("heuristic");
    expect(
      classifyPredictionType({
        hasStatisticalModel: true,
        usedLlm: false,
        ruleMatched: false,
      }),
    ).toBe("statistical_prediction");
    expect(
      classifyPredictionType({
        hasStatisticalModel: false,
        usedLlm: true,
        ruleMatched: false,
      }),
    ).toBe("llm_inference");
    expect(USER_FACING_PREDICTION_LABEL).toBe("過去の利用から提案");
  });
});

describe("Structural diff", () => {
  it("classifies tone/verbosity/headings/bullets — not binary-only", () => {
    const before = "報告である。詳細を述べる。";
    const after = [
      "## 概要",
      "- 要点A",
      "- 要点B",
      "短くまとめます。",
    ].join("\n");
    const diff = computeDiffMetrics({
      before,
      after,
      instructionLength: 100,
      revisionCount: 1,
    });
    expect(diff.categories.length).toBeGreaterThan(0);
    expect(diff.normalizedDiffRate).toBeGreaterThan(0);
    const score = preferenceMatchScore(after, {
      writingStyle: {
        verbosity: "short",
        bulletUsage: "prefer",
        headingDensity: "high",
        tone: "polite",
      },
      structure: {},
      visualStyle: {},
      artifactPreferences: {},
      deliveryPreferences: {},
      approvalPreferences: {},
      appliedMemoryIds: [],
      ignoredMemoryIds: [],
      conflicts: [],
      explicitOverrides: {},
      previewLines: [],
      requiresConfirmation: false,
    });
    expect(score).toBeGreaterThan(0.5);
  });
});

describe("10-loop learning experiment (evaluation mode)", () => {
  it("proves instruction/diff reduction with false application <5% and 0 explicit violations", async () => {
    const categories: Array<{
      category: string;
      artifactType: "docx" | "pptx" | "xlsx";
    }> = [
      { category: "営業レポート", artifactType: "docx" },
      { category: "営業資料", artifactType: "pptx" },
      { category: "レシート", artifactType: "xlsx" },
    ];

    const results = [];
    for (const cat of categories) {
      resetProductionMemoryStoreForTests();
      const result = await runMemoryLearningLoop({
        ownerId: `eval-${cat.artifactType}`,
        category: cat.category,
        artifactType: cat.artifactType,
        loops: 10,
        evaluationMode: true,
      });
      results.push(result);
      expect(result.explicitInstructionViolations).toBe(0);
      expect(result.falseApplicationRate).toBeLessThan(0.05);
      expect(result.instructionReductionRate).toBeGreaterThanOrEqual(0.5);
      expect(result.iterations).toHaveLength(10);
      expect(result.iterations[0]!.appliedMemoryCount).toBe(0);
      expect(
        result.iterations[result.iterations.length - 1]!.appliedMemoryCount,
      ).toBeGreaterThan(0);
    }

    // Honest reporting thresholds — 40% diff reduction target
    for (const result of results) {
      expect(result.diffReductionRate).toBeGreaterThanOrEqual(0.4);
    }

    // A/B with active memories
    const memories = [
      activeMemory({
        ownerId: "ab",
        key: "verbosity",
        scopeType: "workCategory",
        scopeId: "営業レポート",
        category: "営業レポート",
        normalizedValue: { verbosity: "short" },
      }),
      activeMemory({
        ownerId: "ab",
        key: "bulletUsage",
        scopeType: "workCategory",
        scopeId: "営業レポート",
        category: "営業レポート",
        normalizedValue: { bulletUsage: "prefer" },
      }),
      activeMemory({
        ownerId: "ab",
        key: "headingDensity",
        scopeType: "workCategory",
        scopeId: "営業レポート",
        category: "営業レポート",
        normalizedValue: { headingDensity: "high" },
      }),
    ];
    for (const m of memories) upsertProductionMemory(m);
    const comparison = await compareMemoryOnOff({
      ownerId: "ab",
      category: "営業レポート",
      artifactType: "docx",
      memories: listProductionMemories("ab"),
      evaluationMode: true,
    });
    expect(comparison.withMemory.score).toBeGreaterThanOrEqual(
      comparison.withoutMemory.score,
    );
    expect(comparison.withMemory.diffRate).toBeLessThanOrEqual(
      comparison.withoutMemory.diffRate + 0.05,
    );
  }, 120_000);
});

describe("High-impact memories", () => {
  it("does not auto-promote high impact without approval", () => {
    const mem = createCandidateMemory({
      ownerId: "u1",
      key: "saveDestination",
      normalizedValue: { saveDestination: "external" },
      title: "保存先",
      summary: "外部保存",
      scopeType: "global",
      confidence: 0.95,
      evidenceCount: 5,
      highImpact: true,
    });
    const evaluation = evaluatePromotion(mem);
    expect(evaluation.canPromote).toBe(false);
    expect(evaluation.requiresUserApproval).toBe(true);
  });
});
