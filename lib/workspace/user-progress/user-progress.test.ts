import { describe, expect, it, beforeEach } from "vitest";

import { buildUserProgressSnapshot } from "./build-snapshot";
import { resolveUserProgressKind } from "./kinds";
import {
  completeUserProgressSession,
  markUserProgressFileGenerating,
  reportUserProgressOrchestrationStep,
  resetUserProgressStoreForTests,
  startUserProgressSession,
} from "./live-store";
import {
  getUserProgressSteps,
  orchestrationStepToUserIndex,
} from "./steps";

describe("resolveUserProgressKind", () => {
  it("detects sales material from assignment keywords", () => {
    expect(
      resolveUserProgressKind({ assignment: "営業資料を作成して" }),
    ).toBe("sales_material");
  });

  it("detects blog / sns / excel / pdf / receipt", () => {
    expect(resolveUserProgressKind({ assignment: "ブログ記事を書いて" })).toBe(
      "blog",
    );
    expect(resolveUserProgressKind({ assignment: "SNS投稿文を作って" })).toBe(
      "sns",
    );
    expect(resolveUserProgressKind({ assignment: "Excelで集計して" })).toBe(
      "excel",
    );
    expect(resolveUserProgressKind({ assignment: "PDF資料を出力" })).toBe(
      "pdf",
    );
    expect(
      resolveUserProgressKind({ assignment: "レシートを家計簿にして" }),
    ).toBe("receipt");
  });

  it("honors explicit metadata kind", () => {
    expect(
      resolveUserProgressKind({
        assignment: "何か作って",
        metadata: { userProgressKind: "sns" },
      }),
    ).toBe("sns");
  });
});

describe("orchestrationStepToUserIndex", () => {
  it("maps planner/research to organize", () => {
    expect(orchestrationStepToUserIndex("ceo")).toBe(0);
    expect(orchestrationStepToUserIndex("planner_plan")).toBe(0);
    expect(orchestrationStepToUserIndex("planner_tasks")).toBe(0);
  });

  it("maps worker to create", () => {
    expect(orchestrationStepToUserIndex("worker")).toBe(1);
  });

  it("collapses reviewer / QA / approval into polish (no AI names)", () => {
    expect(orchestrationStepToUserIndex("reviewer")).toBe(2);
    expect(orchestrationStepToUserIndex("quality_assurance")).toBe(2);
    expect(orchestrationStepToUserIndex("ceo_approval")).toBe(2);
    expect(orchestrationStepToUserIndex("final_deliverable")).toBe(2);
  });
});

describe("user progress steps copy", () => {
  it("never exposes internal AI role names", () => {
    const kinds = [
      "sales_material",
      "blog",
      "receipt",
      "excel",
      "pdf",
      "sns",
      "generic",
    ] as const;
    const banned =
      /Planner|Writer|Reviewer|Formatter|Quality Engine|Vision|Learning|Automation|CEO/i;
    for (const kind of kinds) {
      for (const step of getUserProgressSteps(kind)) {
        expect(step.label).not.toMatch(banned);
        expect(step.activeLabel).not.toMatch(banned);
      }
    }
  });
});

describe("live progress session", () => {
  beforeEach(() => {
    resetUserProgressStoreForTests();
  });

  it("advances monotonically and only completes after file_done", () => {
    startUserProgressSession({
      userId: "u1",
      sessionId: "s1",
      kind: "sales_material",
    });

    reportUserProgressOrchestrationStep({
      userId: "u1",
      sessionId: "s1",
      step: "worker",
      stepIndex: 1,
    });
    // Regression attempt — ignore lower index.
    reportUserProgressOrchestrationStep({
      userId: "u1",
      sessionId: "s1",
      step: "ceo",
      stepIndex: 0,
    });

    let snap = buildUserProgressSnapshot(
      reportUserProgressOrchestrationStep({
        userId: "u1",
        sessionId: "s1",
        step: "reviewer",
        stepIndex: 2,
      })!,
    );
    expect(snap.activeStepIndex).toBe(2);
    expect(snap.headline).toContain("最終調整");
    expect(snap.phase).toBe("orchestrating");

    snap = buildUserProgressSnapshot(
      markUserProgressFileGenerating({
        userId: "u1",
        sessionId: "s1",
        fileGenerating: true,
      })!,
    );
    expect(snap.phase).toBe("file_generating");
    expect(snap.headline).toContain("Word");

    snap = buildUserProgressSnapshot(
      completeUserProgressSession({
        userId: "u1",
        sessionId: "s1",
        failed: false,
      })!,
    );
    expect(snap.phase).toBe("completed");
    expect(snap.progressPercent).toBe(100);
    expect(snap.headline).toContain("完成");
  });
});
