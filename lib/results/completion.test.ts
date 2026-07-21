import { describe, expect, it } from "vitest";

import { emptyDeliverable, type DeliverableType } from "@/lib/orchestration/deliverable-types";
import { hydrateWorkflowState } from "@/lib/orchestration/workflow-state";
import type { OrchestrationResult } from "@/lib/orchestration/types";
import type { Project } from "@/lib/projects/types";

import {
  deriveCompletionTitle,
  deriveResultIntent,
  deriveTargetType,
} from "./completion";

function makeProject(input: {
  workRequest: string;
  type?: DeliverableType;
  withContent?: boolean;
  noResult?: boolean;
}): Project {
  const now = new Date().toISOString();

  if (input.noResult) {
    return {
      id: "p1",
      title: input.workRequest,
      workRequest: input.workRequest,
      status: "completed",
      progress: 100,
      createdAt: now,
      updatedAt: now,
      assignedEmployees: [],
      result: null,
    };
  }

  const deliverable = emptyDeliverable(input.type ?? "document");
  if (input.withContent !== false) {
    deliverable.title = "サンプル";
    deliverable.content = "本文です。";
    deliverable.markdown = "本文です。";
  }

  const result: OrchestrationResult = {
    assignment: input.workRequest,
    status: "completed",
    ceo: null,
    plannerPlan: null,
    plannerTasks: null,
    tasks: [],
    executions: [],
    deliverable,
    reviewComments: "",
    approved: true,
    finalResponse: "完了しました。",
    totalDurationMs: 1000,
    workflow: hydrateWorkflowState({ status: "completed", approved: true }),
  };

  return {
    id: "p1",
    title: input.workRequest,
    workRequest: input.workRequest,
    status: "completed",
    progress: 100,
    createdAt: now,
    updatedAt: now,
    assignedEmployees: [],
    result,
  };
}

describe("deriveResultIntent", () => {
  it("classifies 投稿よろしく as post_now", () => {
    expect(deriveResultIntent("この内容でX投稿よろしく")).toBe("post_now");
    expect(deriveResultIntent("明日のイベント告知、投稿しといて")).toBe("post_now");
  });

  it("classifies 投稿文を作って as make_post", () => {
    expect(deriveResultIntent("新商品のX投稿文を作って")).toBe("make_post");
  });

  it("classifies 下書きを作って as save_draft", () => {
    expect(deriveResultIntent("キャンペーンの投稿の下書きを作って")).toBe("save_draft");
  });

  it("classifies scheduled requests as schedule", () => {
    expect(deriveResultIntent("明日の9時に投稿して")).toBe("schedule");
    expect(deriveResultIntent("来週の朝にXへポストしてFF")).toBe("schedule");
  });

  it("classifies 直して as revise", () => {
    expect(deriveResultIntent("この文をもう少し丁寧に直して")).toBe("revise");
  });

  it("falls back to general for non-actionable requests", () => {
    expect(deriveResultIntent("先月の売上を要約してレポートにして")).toBe("general");
  });
});

describe("deriveTargetType", () => {
  it("detects X posts even when deliverable type is document", () => {
    expect(
      deriveTargetType(makeProject({ workRequest: "X投稿文を作って", type: "document" })),
    ).toBe("x_post");
  });

  it("detects social_post deliverable type as x_post", () => {
    expect(
      deriveTargetType(makeProject({ workRequest: "何か作って", type: "social_post" })),
    ).toBe("x_post");
  });

  it("treats blog requests with 投稿 as documents, not X posts", () => {
    expect(
      deriveTargetType(makeProject({ workRequest: "ブログ記事を投稿できる形にして", type: "blog" })),
    ).toBe("document");
  });

  it("detects email jobs", () => {
    expect(
      deriveTargetType(makeProject({ workRequest: "取引先への返信メールを作って", type: "email" })),
    ).toBe("email");
  });

  it("defaults to document", () => {
    expect(
      deriveTargetType(makeProject({ workRequest: "月次レポートを作って", type: "report" })),
    ).toBe("document");
  });
});

describe("deriveCompletionTitle", () => {
  it("never returns the uniform 成果物 label", () => {
    const titles = [
      deriveCompletionTitle(makeProject({ workRequest: "X投稿文を作って", type: "document" })),
      deriveCompletionTitle(makeProject({ workRequest: "レポート作って", type: "report" })),
      deriveCompletionTitle(makeProject({ workRequest: "メール作って", type: "email" })),
    ];
    for (const title of titles) {
      expect(title).not.toBe("成果物");
      expect(title).not.toContain("成果物");
    }
  });

  it("derives natural titles per content", () => {
    expect(
      deriveCompletionTitle(makeProject({ workRequest: "X投稿よろしく", type: "document" })),
    ).toBe("X投稿文ができました");
    expect(
      deriveCompletionTitle(makeProject({ workRequest: "月次売上をレポートにして", type: "report" })),
    ).toBe("レポートができました");
    expect(
      deriveCompletionTitle(makeProject({ workRequest: "この契約書を要約して", type: "report" })),
    ).toBe("要約ができました");
    expect(
      deriveCompletionTitle(makeProject({ workRequest: "取引先へ返信して", type: "email" })),
    ).toBe("返信文ができました");
    expect(
      deriveCompletionTitle(makeProject({ workRequest: "家計簿に今日の支出を登録して" })),
    ).toBe("家計簿への登録が完了しました");
  });

  it("falls back to a secretary title when there is no deliverable", () => {
    expect(
      deriveCompletionTitle(makeProject({ workRequest: "何か", noResult: true })),
    ).toBe("MINERVOTが準備しました");
  });
});
