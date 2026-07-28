import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/notifications/emitters", () => ({
  notifyWorkCompleted: vi.fn(),
  notifyWorkFailed: vi.fn(),
}));
vi.mock("@/lib/notifications/durable", () => ({
  persistNotificationsNow: vi.fn(async () => undefined),
}));

import { emptyDeliverable } from "@/lib/orchestration/deliverable-types";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";

import { exportWordDeliverableOnServer } from "./server-word-export";
import { resetDurableDeliverableStoreForTests } from "./durable-store";
import { resetWordJobsForTests } from "./word-job-stages";

function completedResult(
  deliverable: ReturnType<typeof emptyDeliverable>,
): OrchestrationResult {
  return {
    assignment: "営業提案書をWordで作成してください",
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable,
    reviewComments: "",
    approved: true,
    finalResponse:
      "提案書の本文です。十分に長い内容をここに書きます。お客様向けに整理しました。",
    totalDurationMs: 10,
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
    commanderRunId: "run_partial_fields",
  };
}

describe("exportWordDeliverableOnServer prod crash class", () => {
  beforeEach(() => {
    resetDurableDeliverableStoreForTests();
    resetWordJobsForTests();
    vi.stubEnv("ATLAS_DELIVERABLE_STORAGE", "local");
    vi.stubEnv("VERCEL_ENV", "");
    vi.stubEnv("NODE_ENV", "test");
  });

  it("succeeds when summary/content are missing (production crash class)", async () => {
    const deliverable = {
      type: "document" as const,
      title: "営業提案書",
      // summary/content intentionally omitted — mirrors Clerk/JSON round-trip
      markdown:
        "# 営業提案書\n\n## 本文\n\nお客様向けの提案内容です。価値と次の一歩を整理しました。十分な分量の日本語本文です。".repeat(
          2,
        ),
      plainText: "お客様向けの提案内容です。",
      html: "<p>お客様向けの提案内容です。</p>",
      metadata: emptyDeliverable("document").metadata,
      downloads: emptyDeliverable("document").downloads,
    };

    const result = await exportWordDeliverableOnServer({
      userId: "user_prod_crash",
      assignment: "営業提案書をWordファイルで作成してください",
      result: completedResult(deliverable as never),
      requestId: "req_partial_fields",
      jobId: "cmdword_partialfields01",
      notify: false,
    });

    expect(result.attempted).toBe(true);
    expect(result.ok).toBe(true);
    if (result.attempted && result.ok) {
      expect(result.docx.downloadUrl).toContain("/api/deliverables/");
      expect(result.jobId).toBe("cmdword_partialfields01");
    }
  }, 30_000);
});
