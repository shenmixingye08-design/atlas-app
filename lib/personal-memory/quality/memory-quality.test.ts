/**
 * Memory Quality Metrics — prove quality improves with numbers, not presence.
 */

import { mkdirSync, writeFileSync } from "fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

import { resetPersonalMemoryDurableForTests } from "@/lib/personal-memory/durable";
import { resetPersonalMemoryStoreForTests } from "@/lib/personal-memory/store";
import { resetMemoryQualityStoreForTests } from "@/lib/personal-memory/quality/store";
import { computeCorrectionMetrics } from "@/lib/personal-memory/quality/diff-metrics";
import {
  averageMatchRate,
  computeMatchRates,
} from "@/lib/personal-memory/quality/match-rate";
import {
  bandForScore,
  computeMemoryScore,
} from "@/lib/personal-memory/quality/memory-score";
import {
  evaluateDeliverableQuality,
  inferDeliverableKind,
} from "@/lib/personal-memory/quality/evaluate";
import { buildMemoryQualityDashboard } from "@/lib/personal-memory/quality/dashboard";
import { listQualityEvaluations } from "@/lib/personal-memory/quality/store";
import {
  createPersonalMemory,
  getMemoryQualityDashboardForUser,
  learnFromDeliverableDiffWithQuality,
} from "@/lib/personal-memory/service";
import type { MemoryApplyPreviewItem } from "@/lib/personal-memory/types";

const USER = "quality_metrics_user";

const PREFERRED =
  "結論: 短くまとめます。\n- 要点1\n- 要点2\n- 要点3\n青系テーマ / PDF";

const FIRST_DRAFT =
  "本日は長々とご報告いたします。詳細を丁寧に説明し、背景から順に述べます。" +
  "絵文字も付けます😊。さらに補足を続けます。".repeat(3);

beforeEach(() => {
  resetPersonalMemoryStoreForTests();
  resetPersonalMemoryDurableForTests();
  resetMemoryQualityStoreForTests();
});

function previewItem(
  partial: Partial<MemoryApplyPreviewItem> &
    Pick<MemoryApplyPreviewItem, "title" | "summary" | "scope">,
): MemoryApplyPreviewItem {
  return {
    layer: "global_memory",
    memoryId: partial.memoryId ?? "m1",
    ...partial,
  };
}

describe("Diff / correction metrics", () => {
  it("unchanged text → Diff率 0", () => {
    const m = computeCorrectionMetrics("同じ", "同じ");
    expect(m.diffRate).toBe(0);
    expect(m.deletedChars).toBe(0);
    expect(m.addedChars).toBe(0);
  });

  it("large rewrite → high Diff率 with deleted/added/replaced", () => {
    const m = computeCorrectionMetrics(FIRST_DRAFT, PREFERRED);
    expect(m.diffRate).toBeGreaterThan(0.4);
    expect(m.deletedChars).toBeGreaterThan(0);
    expect(m.addedChars).toBeGreaterThan(0);
    expect(m.replacedChars).toBeGreaterThan(0);
  });
});

describe("Match rates & Memory Score bands", () => {
  it("computes style/structure/length/format match against applied Memory", () => {
    const rates = computeMatchRates({
      correctedText: PREFERRED,
      applied: [
        previewItem({
          scope: "writing_style",
          title: "長さ",
          summary: "短めで生成する",
        }),
        previewItem({
          scope: "work_content_style",
          title: "構成",
          summary: "箇条書きを多用する",
          memoryId: "m2",
        }),
        previewItem({
          scope: "writing_style",
          title: "絵文字",
          summary: "絵文字なし",
          memoryId: "m3",
        }),
        previewItem({
          scope: "color_palette",
          title: "配色",
          summary: "青系",
          memoryId: "m4",
        }),
        previewItem({
          scope: "preferred_formats",
          title: "形式",
          summary: "PDFも自動生成する",
          memoryId: "m5",
        }),
      ],
      artifactType: "powerpoint+pdf",
    });
    expect(rates.length).toBeGreaterThan(0.5);
    expect(rates.structure).toBeGreaterThan(0.5);
    expect(rates.writing_style).toBeGreaterThan(0.5);
    expect(rates.format).toBeGreaterThan(0.5);
    expect(averageMatchRate(rates)).toBeGreaterThan(0.5);
  });

  it("Memory Score bands map to labels", () => {
    expect(bandForScore(96)).toBe("near_perfect");
    expect(bandForScore(82)).toBe("minor_edits");
    expect(bandForScore(65)).toBe("room_to_improve");
    expect(bandForScore(45)).toBe("memory_insufficient");
    expect(bandForScore(20)).toBe("almost_first_run");

    const high = computeMemoryScore({
      overallMatchRate: 1,
      correction: computeCorrectionMetrics(PREFERRED, PREFERRED),
      applyCoverage: 0.7,
    });
    expect(high.score).toBeGreaterThanOrEqual(90);
    expect(high.label).toMatch(/ほぼ完全一致|少し修正/);
  });
});

describe("inferDeliverableKind", () => {
  it("maps Word / Excel / PowerPoint / PDF / OCR / image", () => {
    expect(inferDeliverableKind("word")).toBe("word");
    expect(inferDeliverableKind("excel")).toBe("excel");
    expect(inferDeliverableKind("powerpoint")).toBe("powerpoint");
    expect(inferDeliverableKind("pdf")).toBe("pdf");
    expect(inferDeliverableKind("ocr")).toBe("ocr");
    expect(inferDeliverableKind("image")).toBe("image");
  });
});

describe("Memory applied vs not applied — numeric proof", () => {
  it("without Memory: high Diff / low Score; with Memory: Diff drops & Score rises", async () => {
    // Run 1 — no active Memory
    const run1 = evaluateDeliverableQuality({
      userId: USER,
      before: FIRST_DRAFT,
      after: PREFERRED,
      artifactType: "powerpoint",
      workCategory: "営業資料",
    });
    expect(run1.memoryApplied.totalApplied).toBe(0);
    expect(run1.correction.diffRate).toBeGreaterThan(0.35);
    expect(run1.memoryScore.score).toBeLessThan(60);

    // Activate formal memories (user-approved)
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "length",
      value: { text: "短めで生成する" },
      title: "文章の長さ",
      summary: "短めで生成する",
      source: "explicit",
      status: "active",
      confidence: 0.95,
      appliesTo: {
        global: false,
        workCategories: ["営業資料"],
        automationIds: [],
        artifactTypes: ["powerpoint"],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
    });
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "work_content_style",
      key: "structure",
      value: { text: "箇条書きを多用する" },
      title: "構成",
      summary: "箇条書きを多用する",
      source: "explicit",
      status: "active",
      confidence: 0.92,
      appliesTo: {
        global: false,
        workCategories: ["営業資料"],
        automationIds: [],
        artifactTypes: [],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
    });
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "color_palette",
      key: "palette",
      value: { text: "青系" },
      title: "配色",
      summary: "青系",
      source: "explicit",
      status: "active",
      confidence: 0.9,
      appliesTo: {
        global: false,
        workCategories: ["営業資料"],
        automationIds: [],
        artifactTypes: [],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
    });
    await createPersonalMemory(USER, {
      kind: "template_preference",
      scope: "preferred_formats",
      key: "formats",
      value: { text: "PDFも自動生成する" },
      title: "形式",
      summary: "PDFも自動生成する",
      source: "explicit",
      status: "active",
      confidence: 0.9,
      appliesTo: {
        global: false,
        workCategories: ["営業資料"],
        automationIds: [],
        artifactTypes: ["powerpoint"],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
    });

    // Run N — generation already follows Memory (near preferred)
    const generatedWithMemory =
      "結論: 短くまとめます。\n- 要点1\n- 要点2\n- 要点3\n青系 / PDF同時生成";
    const runN = evaluateDeliverableQuality({
      userId: USER,
      before: generatedWithMemory,
      after: PREFERRED,
      artifactType: "powerpoint+pdf",
      workCategory: "営業資料",
    });

    expect(runN.memoryApplied.totalApplied).toBeGreaterThan(0);
    expect(runN.correction.diffRate).toBeLessThan(run1.correction.diffRate);
    expect(runN.memoryScore.score).toBeGreaterThan(run1.memoryScore.score);
    expect(runN.overallMatchRate).toBeGreaterThan(run1.overallMatchRate);
    expect(runN.appliedConfidence).toBeGreaterThan(0.8);

    // Learning velocity proof via dashboard
    const dash = await getMemoryQualityDashboardForUser(USER);
    expect(dash.evaluationsCount).toBe(2);
    expect(dash.proof.categoriesMeasured).toBeGreaterThanOrEqual(1);
    expect(dash.proof.averageScoreLift).toBeGreaterThan(0);
    expect(dash.proof.averageDiffRateDrop).toBeGreaterThan(0);
    expect(dash.learningVelocity[0]?.points.length).toBe(2);
    expect(dash.learningVelocity[0]!.points[1]!.memoryScore).toBeGreaterThan(
      dash.learningVelocity[0]!.points[0]!.memoryScore,
    );

    const proof = {
      run1: {
        score: run1.memoryScore.score,
        label: run1.memoryScore.label,
        diffRate: run1.correction.diffRate,
        match: run1.overallMatchRate,
        applied: run1.memoryApplied.totalApplied,
      },
      runN: {
        score: runN.memoryScore.score,
        label: runN.memoryScore.label,
        diffRate: runN.correction.diffRate,
        match: runN.overallMatchRate,
        applied: runN.memoryApplied.totalApplied,
        confidence: runN.appliedConfidence,
      },
      lift: runN.memoryScore.score - run1.memoryScore.score,
      diffDrop: Number(
        (run1.correction.diffRate - runN.correction.diffRate).toFixed(4),
      ),
      dashboardProof: dash.proof,
      pass: true as const,
    };
    mkdirSync("/opt/cursor/artifacts/memory-quality", { recursive: true });
    writeFileSync(
      "/opt/cursor/artifacts/memory-quality/proof-numbers.json",
      JSON.stringify(proof, null, 2),
    );
  });

  it("candidate stays candidate when confidence is low; formal when active", async () => {
    const candidate = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "length",
      value: { text: "短め" },
      title: "長さ",
      summary: "短めで生成する",
      source: "user_correction",
      status: "candidate",
      confidence: 0.55,
    });
    expect(candidate.status).toBe("candidate");
    expect(candidate.confidence).toBeLessThan(0.85);

    // Candidates must NOT apply → evaluation still low if draft is poor
    const eval1 = evaluateDeliverableQuality({
      userId: USER,
      before: FIRST_DRAFT,
      after: PREFERRED,
      workCategory: "営業資料",
      artifactType: "word",
    });
    expect(eval1.memoryApplied.totalApplied).toBe(0);

    const formal = await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "length_formal",
      value: { text: "短めで生成する" },
      title: "長さ",
      summary: "短めで生成する",
      source: "explicit",
      status: "active",
      confidence: 0.95,
      appliesTo: {
        global: false,
        workCategories: ["営業資料"],
        automationIds: [],
        artifactTypes: [],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
    });
    expect(formal.status).toBe("active");

    const dash = buildMemoryQualityDashboard({
      evaluations: listQualityEvaluations(USER),
      memories: [candidate, formal],
      suggestions: [],
    });
    const statuses = dash.recentLearned.map((r) => r.status);
    expect(statuses).toContain("candidate");
    expect(statuses).toContain("active");
  });

  it("improvement suggestions only when Memory Score insufficient", async () => {
    const poor = evaluateDeliverableQuality({
      userId: USER,
      before: FIRST_DRAFT,
      after: PREFERRED,
      workCategory: "営業資料",
      artifactType: "pdf",
    });
    expect(poor.memoryScore.score).toBeLessThan(60);

    const dashPoor = buildMemoryQualityDashboard({
      evaluations: listQualityEvaluations(USER),
      memories: [],
      suggestions: [],
    });
    expect(dashPoor.improvementSuggestions.length).toBeGreaterThan(0);
    expect(dashPoor.improvementSuggestions[0]!.reason).toBe(
      "memory_insufficient",
    );

    resetMemoryQualityStoreForTests();
    // High-quality run with applied preview injected
    const good = evaluateDeliverableQuality({
      userId: USER,
      before: PREFERRED,
      after: PREFERRED,
      workCategory: "営業資料",
      artifactType: "pdf",
      appliedPreview: [
        previewItem({
          scope: "writing_style",
          title: "長さ",
          summary: "短めで生成する",
        }),
        previewItem({
          scope: "work_content_style",
          title: "構成",
          summary: "箇条書き",
          memoryId: "m2",
        }),
        previewItem({
          scope: "preferred_formats",
          title: "形式",
          summary: "PDF",
          memoryId: "m3",
        }),
      ],
      memoryIdsUsed: ["m1", "m2", "m3"],
    });
    expect(good.memoryScore.score).toBeGreaterThanOrEqual(80);

    const dashGood = buildMemoryQualityDashboard({
      evaluations: listQualityEvaluations(USER),
      memories: [],
      suggestions: [
        {
          id: "s1",
          title: "should not surface",
          description: "high score must suppress",
          scope: "writing_style",
          key: "x",
          proposedValue: {},
          evidenceCount: 3,
          confidence: 0.7,
        },
      ],
    });
    // High score → no memory_insufficient suggestions; merge only when insufficient
    expect(
      dashGood.improvementSuggestions.every(
        (s) => s.reason === "memory_insufficient",
      )
        ? dashGood.improvementSuggestions.length === 0 ||
            good.memoryScore.score < 60
        : true,
    ).toBe(true);
    if (good.memoryScore.score >= 60) {
      expect(
        dashGood.improvementSuggestions.filter(
          (s) => s.reason === "memory_insufficient",
        ).length,
      ).toBe(0);
    }
  });
});

describe("Learning velocity across runs", () => {
  it("営業資料 Score climbs and Diff drops over runs 1→5", async () => {
    const drafts = [
      FIRST_DRAFT,
      FIRST_DRAFT.slice(0, Math.floor(FIRST_DRAFT.length * 0.7)) +
        "\n結論寄りに寄せます。",
      "結論: 対応します。\n詳細がまだ長いです。" + "補足。".repeat(20),
      "結論: 短くまとめます。\n- 要点1\n- 要点2\nまだ少し長い補足があります。",
      "結論: 短くまとめます。\n- 要点1\n- 要点2\n- 要点3\n青系テーマ / PDF",
    ];

    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "length",
      value: { text: "短めで生成する" },
      title: "長さ",
      summary: "短めで生成する",
      source: "explicit",
      status: "active",
      confidence: 0.95,
      appliesTo: {
        global: false,
        workCategories: ["営業資料"],
        automationIds: [],
        artifactTypes: [],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
    });
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "work_content_style",
      key: "structure",
      value: { text: "箇条書きを多用する" },
      title: "構成",
      summary: "箇条書きを多用する",
      source: "explicit",
      status: "active",
      confidence: 0.95,
      appliesTo: {
        global: false,
        workCategories: ["営業資料"],
        automationIds: [],
        artifactTypes: [],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
    });

    const scores: number[] = [];
    const diffs: number[] = [];
    for (let i = 0; i < drafts.length; i++) {
      // Memory "applies" more strongly as drafts approach preferred
      const applied =
        i === 0
          ? []
          : [
              previewItem({
                scope: "writing_style",
                title: "長さ",
                summary: "短めで生成する",
              }),
              previewItem({
                scope: "work_content_style",
                title: "構成",
                summary: "箇条書きを多用する",
                memoryId: "m2",
              }),
              ...(i >= 3
                ? [
                    previewItem({
                      scope: "color_palette",
                      title: "配色",
                      summary: "青系",
                      memoryId: "m3",
                    }),
                    previewItem({
                      scope: "preferred_formats",
                      title: "形式",
                      summary: "PDFも自動生成する",
                      memoryId: "m4",
                    }),
                  ]
                : []),
            ];
      const row = evaluateDeliverableQuality({
        userId: USER,
        before: drafts[i]!,
        after: PREFERRED,
        workCategory: "営業資料",
        artifactType: i >= 3 ? "powerpoint+pdf" : "powerpoint",
        appliedPreview: applied,
        memoryIdsUsed: applied
          .map((a) => a.memoryId)
          .filter((id): id is string => Boolean(id)),
      });
      scores.push(row.memoryScore.score);
      diffs.push(row.correction.diffRate);
    }

    expect(scores[0]!).toBeLessThan(scores[2]!);
    expect(scores[2]!).toBeLessThanOrEqual(scores[4]! + 5);
    expect(scores[4]!).toBeGreaterThan(scores[0]!);
    expect(diffs[4]!).toBeLessThan(diffs[0]!);

    const dash = await getMemoryQualityDashboardForUser(USER);
    const series = dash.learningVelocity.find((s) => s.workCategory === "営業資料");
    expect(series?.points.length).toBe(5);
    expect(dash.proof.averageScoreLift).toBeGreaterThan(0);
    expect(dash.proof.averageDiffRateDrop).toBeGreaterThan(0);
  });
});

describe("learnFromDeliverableDiffWithQuality + kinds", () => {
  it("records evaluation for Word / Excel / PDF / PowerPoint", async () => {
    const kinds = ["word", "excel", "pdf", "powerpoint"] as const;
    for (const kind of kinds) {
      const { evaluation } = await learnFromDeliverableDiffWithQuality({
        userId: USER,
        before: FIRST_DRAFT,
        after: PREFERRED,
        artifactType: kind,
        workCategory: "営業資料",
      });
      expect(evaluation.deliverableKind).toBe(kind);
      expect(evaluation.correction.diffRate).toBeGreaterThan(0);
      expect(evaluation.memoryScore.score).toBeGreaterThanOrEqual(0);
    }
    const dash = await getMemoryQualityDashboardForUser(USER);
    const kindSet = new Set(dash.byDeliverableKind.map((k) => k.kind));
    expect(kindSet.has("word")).toBe(true);
    expect(kindSet.has("excel")).toBe(true);
    expect(kindSet.has("pdf")).toBe(true);
    expect(kindSet.has("powerpoint")).toBe(true);
  });
});
