import { describe, expect, it } from "vitest";

import { createWorkMemory, updateWorkMemory } from "@/lib/work-memory/service";
import { inferLearningDomain } from "./domains";
import {
  buildAnalysisDataset,
  recordLearningEventFromOrchestration,
  runLearningAnalysis,
  INSUFFICIENT_MESSAGE,
} from "./engine";
import { resetLearningStores } from "./store";

describe("learning engine", () => {
  const userId = "user_learning_engine_test";

  it("infers work domains from assignment", () => {
    expect(inferLearningDomain({ assignment: "営業資料を作成" })).toBe(
      "sales_material",
    );
    expect(inferLearningDomain({ assignment: "SNS投稿を書いて" })).toBe(
      "social_post",
    );
    expect(
      inferLearningDomain({
        assignment: "generic task",
        deliverableType: "blog",
      }),
    ).toBe("document_creation");
  });

  it("records learning events without running analysis", () => {
    resetLearningStores(userId);
    const event = recordLearningEventFromOrchestration({
      userId,
      assignment: "営業資料を作成",
      deliverableType: "sales_material",
      durationMs: 120_000,
      memoriesUsedCount: 2,
      completed: true,
    });
    expect(event.eventId).toMatch(/^le_/);
    expect(event.domain).toBe("sales_material");
  });

  it("returns insufficient data message when data is sparse", () => {
    resetLearningStores(userId);
    const report = runLearningAnalysis(userId, { periodDays: 30 });
    expect(report.hasSufficientData).toBe(false);
    expect(report.insufficientMessage).toBe(INSUFFICIENT_MESSAGE);
    expect(report.sections.improvements).toHaveLength(0);
  });

  it("generates evidence-based sections when data exists", () => {
    resetLearningStores(userId);

    const memory = createWorkMemory(userId, {
      type: "template",
      title: "営業資料テンプレ",
      summary: "16:9 · 3章構成",
      isUserConfirmed: true,
    });
    expect(memory).not.toBeNull();
    if (memory) {
      updateWorkMemory(userId, memory.id, { confidence: 0.9 });
    }

    for (let i = 0; i < 3; i++) {
      recordLearningEventFromOrchestration({
        userId,
        assignment: "営業資料を作成",
        deliverableType: "sales_material",
        durationMs: 90_000 + i * 1000,
        memoriesUsedCount: 1,
        memoryTypesUsed: ["template"],
      });
    }

    const dataset = buildAnalysisDataset(userId, 30);
    expect(dataset.events.length).toBeGreaterThanOrEqual(3);

    const report = runLearningAnalysis(userId, { periodDays: 30 });
    expect(report.hasSufficientData).toBe(true);
    const allItems = [
      ...report.sections.improvements,
      ...report.sections.maintain,
      ...report.sections.recommendations,
      ...report.sections.futureProposals,
    ];
    if (allItems.length > 0) {
      expect(allItems.every((item) => item.evidence.length > 0)).toBe(true);
    }
  });

  it("isolates learning data per user", () => {
    resetLearningStores("user_a");
    resetLearningStores("user_b");

    recordLearningEventFromOrchestration({
      userId: "user_a",
      assignment: "資料作成",
    });

    const reportA = runLearningAnalysis("user_a", { periodDays: 30 });
    const reportB = runLearningAnalysis("user_b", { periodDays: 30 });

    expect(reportA.summary.eventCount).toBeGreaterThan(0);
    expect(reportB.summary.eventCount).toBe(0);
  });
});
