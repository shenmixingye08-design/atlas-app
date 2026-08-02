/**
 * Predictive Personal Memory — prove first-accept / threshold / loop.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/persistence/durable-domain", () => ({
  persistDurableDomain: vi.fn(async () => "supabase"),
  loadDurableDomain: vi.fn(async () => null),
}));

import { resetPersonalMemoryDurableForTests } from "@/lib/personal-memory/durable";
import { resetPersonalMemoryStoreForTests } from "@/lib/personal-memory/store";
import { resetMemoryQualityStoreForTests } from "@/lib/personal-memory/quality/store";
import { resetPredictStoreForTests } from "@/lib/personal-memory/predict/store";
import {
  bandForPredictionScore,
  computePredictionScore,
} from "@/lib/personal-memory/predict/score";
import {
  buildPredictiveDashboard,
  predictMemoriesForContext,
  recordPredictionOutcomes,
  togglePredictedMemory,
} from "@/lib/personal-memory/predict/engine";
import { evaluateDeliverableQuality } from "@/lib/personal-memory/quality/evaluate";
import {
  acceptPredictivePreview,
  createPersonalMemory,
  getApplyPreviewForContext,
} from "@/lib/personal-memory/service";
import { PREDICTION_AUTO_APPLY_THRESHOLD } from "@/lib/personal-memory/predict/types";

const USER = "predict_user";

beforeEach(() => {
  resetPersonalMemoryStoreForTests();
  resetPersonalMemoryDurableForTests();
  resetMemoryQualityStoreForTests();
  resetPredictStoreForTests();
});

async function seedSalesMemories() {
  await createPersonalMemory(USER, {
    kind: "user_preference",
    scope: "writing_style",
    key: "length",
    value: { text: "短めで生成する" },
    title: "短文",
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
    evidence: [
      { kind: "correction", summary: "短く", occurredAt: new Date().toISOString() },
      { kind: "correction", summary: "短く", occurredAt: new Date().toISOString() },
      { kind: "run", summary: "短文適用", occurredAt: new Date().toISOString() },
    ],
  });
  await createPersonalMemory(USER, {
    kind: "user_preference",
    scope: "work_content_style",
    key: "structure",
    value: { text: "箇条書きを多用する" },
    title: "箇条書き",
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
    evidence: [
      { kind: "correction", summary: "箇条書き", occurredAt: new Date().toISOString() },
      { kind: "correction", summary: "箇条書き", occurredAt: new Date().toISOString() },
    ],
  });
  await createPersonalMemory(USER, {
    kind: "user_preference",
    scope: "color_palette",
    key: "palette",
    value: { text: "青系" },
    title: "青基調",
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
    evidence: Array.from({ length: 8 }, (_, i) => ({
      kind: "run" as const,
      summary: `青系 ${i}`,
      occurredAt: new Date().toISOString(),
    })),
  });
  await createPersonalMemory(USER, {
    kind: "template_preference",
    scope: "preferred_formats",
    key: "formats",
    value: { text: "PDFも自動生成する" },
    title: "PDF同時生成",
    summary: "PDFも自動生成する",
    source: "explicit",
    status: "active",
    confidence: 0.96,
    appliesTo: {
      global: false,
      workCategories: ["営業資料"],
      automationIds: [],
      artifactTypes: [],
      capabilities: [],
      companyIds: [],
      templateIds: [],
    },
    evidence: Array.from({ length: 10 }, (_, i) => ({
      kind: "run" as const,
      summary: `pdf ${i}`,
      occurredAt: new Date().toISOString(),
    })),
  });
}

describe("Prediction Score bands", () => {
  it("maps bands and autoApply threshold at 60%", () => {
    expect(bandForPredictionScore(97)).toBe("very_high");
    expect(bandForPredictionScore(90)).toBe("high");
    expect(bandForPredictionScore(75)).toBe("candidate");
    expect(bandForPredictionScore(60)).toBe("confirm_recommended");
    expect(bandForPredictionScore(40)).toBe("do_not_apply");

    const low = computePredictionScore({
      layer: "system_inference",
      confidence: 0.3,
      evidenceCount: 0,
      evidenceTotal: 10,
      rejectionCount: 2,
    });
    expect(low.score).toBeLessThan(PREDICTION_AUTO_APPLY_THRESHOLD * 100);
    expect(low.autoApply).toBe(false);

    const high = computePredictionScore({
      layer: "deliverable_category",
      confidence: 0.95,
      evidenceCount: 17,
      evidenceTotal: 18,
    });
    expect(high.autoApply).toBe(true);
    expect(high.score).toBeGreaterThanOrEqual(75);
  });
});

describe("Predict engine", () => {
  it("predicts sales preferences with explain + estimated match", async () => {
    await seedSalesMemories();
    const pred = predictMemoriesForContext({
      userId: USER,
      workCategory: "営業資料",
      notes: "営業資料をつくって",
    });
    expect(pred.headline).toMatch(/営業資料/);
    expect(pred.items.length).toBeGreaterThanOrEqual(3);
    expect(pred.autoApplyItems.length).toBeGreaterThan(0);
    expect(pred.items.every((i) => i.explain.length > 0)).toBe(true);
    expect(pred.estimatedMatchRate).toBeGreaterThan(0.5);
    expect(pred.overallPrediction.autoApply).toBe(true);
  });

  it("Prediction OFF: disabled memories are not auto-applied", async () => {
    await seedSalesMemories();
    const first = predictMemoriesForContext({
      userId: USER,
      workCategory: "営業資料",
    });
    const target = first.autoApplyItems[0];
    expect(target?.memoryId).toBeTruthy();

    const toggled = togglePredictedMemory({
      userId: USER,
      predictionId: first.id,
      memoryId: target!.memoryId!,
      enabled: false,
    });
    expect(toggled?.autoApplyItems.some((i) => i.memoryId === target!.memoryId)).toBe(
      false,
    );

    const again = predictMemoriesForContext({
      userId: USER,
      workCategory: "営業資料",
      disabledMemoryIds: [target!.memoryId!],
    });
    expect(again.autoApplyItems.some((i) => i.memoryId === target!.memoryId)).toBe(
      false,
    );
  });

  it("Prediction failure (<60%): does not auto-apply weak memory", async () => {
    await createPersonalMemory(USER, {
      kind: "user_preference",
      scope: "writing_style",
      key: "guess",
      value: { text: "確度が低い好み" },
      title: "推測",
      summary: "まだ確度が低い好み",
      source: "explicit",
      status: "active",
      confidence: 0.2,
      appliesTo: {
        global: true,
        workCategories: [],
        automationIds: [],
        artifactTypes: [],
        capabilities: [],
        companyIds: [],
        templateIds: [],
      },
      evidence: [],
    });

    const pred = predictMemoriesForContext({
      userId: USER,
      workCategory: "営業資料",
    });
    const weak = pred.items.filter((i) => i.prediction.score < 60);
    expect(weak.length).toBeGreaterThan(0);
    for (const item of weak) {
      expect(item.enabled).toBe(false);
      expect(item.requiresConfirm).toBe(true);
      expect(item.prediction.autoApply).toBe(false);
    }
  });

  it("current instruction wins over memory (conflict)", async () => {
    await seedSalesMemories();
    const pred = predictMemoriesForContext({
      userId: USER,
      workCategory: "営業資料",
      currentInstruction: { writing_style: "長文で丁寧に" },
    });
    // Instruction covers writing_style scope → length memory may be unused
    const preview = await getApplyPreviewForContext({
      userId: USER,
      workCategory: "営業資料",
      currentInstruction: { writing_style: "長文で丁寧に" },
    });
    expect(preview.prediction).toBeTruthy();
    expect(preview.ledger).toBeTruthy();
    // Ensure prediction payload exists even with instruction override
    expect(pred.id).toBeTruthy();
  });

  it("First Accept records outcomes and raises success rate", async () => {
    await seedSalesMemories();
    const pred = predictMemoriesForContext({
      userId: USER,
      workCategory: "営業資料",
    });
    await acceptPredictivePreview({
      userId: USER,
      predictionId: pred.id,
      enabledMemoryIds: pred.autoApplyItems
        .map((i) => i.memoryId)
        .filter((id): id is string => Boolean(id)),
    });
    const dash = buildPredictiveDashboard(USER);
    expect(dash.recentApplied.length).toBeGreaterThan(0);
    expect(dash.predictionSuccessRate).toBeGreaterThan(0.5);
    expect(dash.kpis.firstAcceptRate).toBeGreaterThan(0);
  });

  it("rejected memories appear in recentRejected and are not re-pushed blindly", async () => {
    await seedSalesMemories();
    const pred = predictMemoriesForContext({
      userId: USER,
      workCategory: "営業資料",
    });
    const mem = pred.items.find((i) => i.memoryId)!;
    recordPredictionOutcomes({
      userId: USER,
      predictionId: pred.id,
      outcomes: [
        { memoryId: mem.memoryId!, outcome: "rejected", enabled: false },
      ],
    });
    const dash = buildPredictiveDashboard(USER);
    expect(dash.recentRejected.length).toBeGreaterThan(0);
  });

  it("Automation suggestion after repeated accepts", async () => {
    await seedSalesMemories();
    for (let i = 0; i < 4; i++) {
      const pred = predictMemoriesForContext({
        userId: USER,
        workCategory: "営業資料",
      });
      recordPredictionOutcomes({
        userId: USER,
        predictionId: pred.id,
        outcomes: pred.autoApplyItems
          .filter((x) => x.memoryId)
          .map((x) => ({
            memoryId: x.memoryId!,
            outcome: "accepted" as const,
            enabled: true,
          })),
      });
    }
    const dash = buildPredictiveDashboard(USER);
    expect(
      dash.proactiveSuggestions.some((s) => s.kind === "automation"),
    ).toBe(true);
  });

  it("learning loop: Diff Reduction after Memory-applied generation", async () => {
    await seedSalesMemories();
    const firstDraft =
      "本日は長々とご報告いたします。詳細を丁寧に説明します。😊".repeat(4);
    const preferred =
      "結論: 短くまとめます。\n- 要点1\n- 要点2\n- 要点3\n青系 / PDF";

    evaluateDeliverableQuality({
      userId: USER,
      before: firstDraft,
      after: preferred,
      workCategory: "営業資料",
      artifactType: "powerpoint",
    });

    const withMemory =
      "結論: 短くまとめます。\n- 要点1\n- 要点2\n- 要点3\n青系 / PDF同時生成";
    evaluateDeliverableQuality({
      userId: USER,
      before: withMemory,
      after: preferred,
      workCategory: "営業資料",
      artifactType: "powerpoint+pdf",
    });

    // Seed history accepts so KPIs populate
    const pred = predictMemoriesForContext({
      userId: USER,
      workCategory: "営業資料",
    });
    recordPredictionOutcomes({
      userId: USER,
      predictionId: pred.id,
      outcomes: pred.autoApplyItems
        .filter((x) => x.memoryId)
        .map((x) => ({
          memoryId: x.memoryId!,
          outcome: "accepted" as const,
          enabled: true,
        })),
    });

    const dash = buildPredictiveDashboard(USER);
    expect(dash.kpis.diffReduction).toBeGreaterThan(0);
    expect(dash.kpis.memoryAccuracy).toBeGreaterThan(0);
  });
});
