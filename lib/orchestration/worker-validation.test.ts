import { describe, expect, it } from "vitest";

import { classifyDeliverableType } from "@/lib/orchestration/deliverable-classification";
import { assertWorkersProducedDeliverables } from "@/lib/orchestration/worker-validation";
import type { TaskExecutionResult } from "@/lib/orchestration/types";

const SALES_EMAIL_ASSIGNMENT =
  "建設会社へ太陽光発電の営業メールを作成してください。500文字程度。";

const PROSE_EMAIL_OUTPUT = [
  "件名：太陽光発電導入のご提案",
  "",
  "株式会社〇〇 建設部 御中",
  "",
  "突然のご連絡失礼いたします。",
  "太陽光発電ソリューションをご提供している△△株式会社の営業担当でございます。",
  "貴社の施工現場や事務所における電力コスト削減のご提案をさせていただきたく、",
  "ご連絡差し上げました。",
  "初期投資を抑えたリースプランもご用意しておりますので、",
  "15分程度のオンライン説明の機会をいただけますと幸いです。",
  "ご検討のほど、よろしくお願いいたします。",
].join("\n");

function buildExecution(outputText: string): TaskExecutionResult {
  return {
    task: { id: 1, title: "営業メール作成", description: "Sales email" },
    assignedEmployeeId: "development-senior-dev",
    worker: {
      result: {
        agentId: "worker",
        role: "worker",
        name: "Worker",
        outputText,
        responseId: "prose-email",
        status: "completed",
        model: "gpt-test",
      },
      durationMs: 100,
    },
    workerStatus: "completed",
    reviewer: null,
    reviewerStatus: "skipped",
    approved: false,
  };
}

describe("worker validation for email prose output", () => {
  it("accepts non-JSON email prose from the worker", () => {
    const type = classifyDeliverableType(SALES_EMAIL_ASSIGNMENT);

    expect(() =>
      assertWorkersProducedDeliverables(
        [buildExecution(PROSE_EMAIL_OUTPUT)],
        SALES_EMAIL_ASSIGNMENT,
        type,
      ),
    ).not.toThrow();
  });

  it("rejects CEO routing text mistaken as worker output", () => {
    const ceoLikeOutput = [
      "## 目的",
      SALES_EMAIL_ASSIGNMENT,
      "",
      "## ルーティング",
      "Planner → Worker → QA → 各部門レビュー",
    ].join("\n");

    expect(() =>
      assertWorkersProducedDeliverables(
        [buildExecution(ceoLikeOutput)],
        SALES_EMAIL_ASSIGNMENT,
        "email",
      ),
    ).toThrow();
  });
});
