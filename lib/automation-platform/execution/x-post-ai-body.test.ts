/**
 * X auto-post: generate-type must not become missing-input.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/get-clerk-user-email", () => ({
  getClerkUserPrimaryEmail: vi.fn(async () => "owner@example.com"),
}));
vi.mock("@/lib/billing/access", () => ({
  getBillingFeatureDenial: vi.fn(async () => null),
}));
vi.mock("@/lib/integrations/x/post/service", () => ({
  postTweetNowForUser: vi.fn(),
}));
vi.mock("@/lib/memory-apply/step-body", () => ({
  applyMemoryToStepBody: vi.fn(async (input: { baseline: string }) => ({
    text: input.baseline,
    applied: false,
    memoryIdsUsed: [],
    appliedKeys: [],
    channels: [],
  })),
}));
vi.mock("@/lib/automation-platform/execution/x-post-generate", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/automation-platform/execution/x-post-generate")
  >();
  return {
    ...actual,
    generateXAutomationPostText: vi.fn(),
  };
});

import { postTweetNowForUser } from "@/lib/integrations/x/post/service";
import { generateXAutomationPostText } from "@/lib/automation-platform/execution/x-post-generate";
import { maybePrepareXPostCopyForRun } from "@/lib/automation-platform/execution/x-post-prepare";
import { strictStepInvoker } from "@/lib/automation-platform/execution/strict-step-invoker";
import { classifyXPostContent } from "@/lib/automation-platform/execution/x-post-content";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";

const postTweetNowForUserMock = vi.mocked(postTweetNowForUser);
const generateMock = vi.mocked(generateXAutomationPostText);

function step(
  partial: Partial<AutomationWorkflowStep> &
    Pick<AutomationWorkflowStep, "id" | "type" | "name">,
): AutomationWorkflowStep {
  return {
    id: partial.id,
    type: partial.type,
    name: partial.name,
    order: partial.order ?? 0,
    inputBindings: {},
    configuration: partial.configuration ?? {},
    requiresApproval: partial.requiresApproval ?? true,
    retryPolicy: { maxAttempts: 2, backoffMs: [0] },
    timeoutMs: 10_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

function withXEnv(run: () => Promise<void>): Promise<void> {
  const prevId = process.env.X_CLIENT_ID;
  const prevSecret = process.env.X_CLIENT_SECRET;
  process.env.X_CLIENT_ID = "test-x-client";
  process.env.X_CLIENT_SECRET = "test-x-secret";
  return run().finally(() => {
    if (prevId === undefined) delete process.env.X_CLIENT_ID;
    else process.env.X_CLIENT_ID = prevId;
    if (prevSecret === undefined) delete process.env.X_CLIENT_SECRET;
    else process.env.X_CLIENT_SECRET = prevSecret;
  });
}

function readyPost(text: string) {
  return {
    status: "ready" as const,
    mode: "immediate" as const,
    history: {
      id: "hist_1",
      userId: "user_x",
      text,
      mode: "immediate" as const,
      status: "success" as const,
      postedAt: new Date().toISOString(),
      tweetId: "tw_ai_1",
      tweetUrl: "https://x.com/i/web/status/tw_ai_1",
      errorMessage: null,
      scheduledFor: null,
      automationId: "auto_x",
      validation: {
        charCount: text.length,
        maxChars: 280,
        urls: [],
        mentions: [],
        hashtags: [],
        errors: [],
      },
      driveFileUrl: null,
    },
  };
}

describe("X post AI body vs missing-input", () => {
  beforeEach(() => {
    resetFeatureFlagStore();
    setFeatureFlagState("x", "on");
    postTweetNowForUserMock.mockReset();
    generateMock.mockReset();
  });

  it("Test 1: generate-type empty config generates and does not ask for input", async () => {
    await withXEnv(async () => {
      generateMock.mockResolvedValue({
        ok: true,
        text: "MINERVOTの今日の案内です。",
        usedFallback: false,
      });
      postTweetNowForUserMock.mockResolvedValue(
        readyPost("MINERVOTの今日の案内です。"),
      );

      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: { contentSource: "generate" },
        }),
        userId: "user_x",
        automationName: "SNS投稿の自動化",
        runId: "run_gen_1",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
      });

      expect(result.ok).toBe(true);
      expect(result.needsUserInput).toBeFalsy();
      expect(result.summary).not.toContain("投稿本文が設定されていません");
      expect(generateMock).toHaveBeenCalledTimes(1);
      expect(postTweetNowForUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ text: "MINERVOTの今日の案内です。" }),
      );
    });
  });

  it("Test 2: fixed quoted text posts without AI generation", async () => {
    await withXEnv(async () => {
      postTweetNowForUserMock.mockResolvedValue(readyPost("おはようございます"));

      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: {
            contentSource: "fixed",
            text: "おはようございます",
          },
        }),
        userId: "user_x",
        automationName: "挨拶投稿",
        runId: "run_fixed",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "毎日『おはようございます』と投稿して",
      });

      expect(result.ok).toBe(true);
      expect(generateMock).not.toHaveBeenCalled();
      expect(postTweetNowForUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ text: "おはようございます" }),
      );
    });
  });

  it("Test 3: 即実行 generate proceeds to X post after approval (no text input)", async () => {
    await withXEnv(async () => {
      generateMock.mockResolvedValue({
        ok: true,
        text: "副業のヒントです。",
        usedFallback: false,
      });
      postTweetNowForUserMock.mockResolvedValue(readyPost("副業のヒントです。"));

      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: { contentSource: "generate", topic: "副業" },
        }),
        userId: "user_x",
        automationName: "副業投稿",
        runId: "run_immediate",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "毎日副業について投稿内容を考えて即実行して",
      });

      expect(result.ok).toBe(true);
      expect(result.needsUserInput).toBeFalsy();
      expect(postTweetNowForUserMock).toHaveBeenCalled();
    });
  });

  it("Test 4: approval preview shows generated text; user does not write it", async () => {
    generateMock.mockResolvedValue({
      ok: true,
      text: "確認用の生成本文",
      usedFallback: false,
    });

    const automation = {
      name: "副業投稿",
      instruction: {
        freeformNotes: "毎日副業について投稿内容を考えて、投稿前に確認したい",
        structuredOptions: {},
      },
      workflow: {
        steps: [
          step({
            id: "x",
            type: "x_post",
            name: "投稿",
            configuration: { contentSource: "generate", topic: "副業" },
          }),
        ],
      },
    } as unknown as AutomationV2;

    const prepared = await maybePrepareXPostCopyForRun({
      automation,
      preparation: {
        summary: "1. 投稿（確認対象）",
        plannedSteps: [],
        approvalReason: "review_before_run",
        approvalStepIds: ["x"],
        externalEffects: ["X投稿"],
        estimatedDurationLabel: "約1〜3分",
        timezone: "Asia/Tokyo",
        scheduledLabel: "スケジュール実行",
        preparedAt: new Date().toISOString(),
      },
      resolvedInstruction: null,
    });

    expect(prepared.preparation.xPostContentMode).toBe("generate");
    expect(prepared.preparation.generatedXPostText).toBe("確認用の生成本文");
    expect(prepared.preparation.summary).toContain("入力は不要です");
    expect(prepared.preparation.summary).toContain("確認用の生成本文");
  });

  it("Test 5: unresolved これ is missing-input, not generate", async () => {
    await withXEnv(async () => {
      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: { contentSource: "unresolved" },
        }),
        userId: "user_x",
        automationName: "投稿",
        runId: "run_missing",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "これをXに投稿して",
      });

      expect(result.ok).toBe(false);
      expect(result.needsUserInput).toBe(true);
      expect(result.summary).toBe("投稿する内容が確認できません");
      expect(generateMock).not.toHaveBeenCalled();
      expect(postTweetNowForUserMock).not.toHaveBeenCalled();
    });
  });

  it("Test 6: X disconnected is not treated as missing body", async () => {
    await withXEnv(async () => {
      generateMock.mockResolvedValue({
        ok: true,
        text: "生成済み本文",
        usedFallback: false,
      });
      postTweetNowForUserMock.mockResolvedValue({
        status: "x_not_connected",
        message: "X未連携",
      });

      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: { contentSource: "generate" },
        }),
        userId: "user_x",
        automationName: "SNS投稿の自動化",
        runId: "run_noconnect",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
      });

      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("not_connected");
      expect(result.summary).toContain("X連携");
      expect(result.summary).not.toContain("投稿本文が設定されていません");
      expect(result.summary).not.toBe("投稿する内容が確認できません");
    });
  });

  it("Test 7: AI generation failure is retryable, not missing-input", async () => {
    await withXEnv(async () => {
      generateMock.mockResolvedValue({
        ok: false,
        errorCode: "x_post_generation_failed",
        errorMessage: "投稿本文の自動作成に失敗しました。再試行できます。",
      });

      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: { contentSource: "generate" },
        }),
        userId: "user_x",
        automationName: "SNS投稿の自動化",
        runId: "run_gen_fail",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
      });

      expect(result.ok).toBe(false);
      expect(result.needsUserInput).toBeFalsy();
      expect(result.retryable).toBe(true);
      expect(result.errorMessage).toBe("x_post_generation_failed");
      expect(result.summary).toContain("自動作成に失敗");
      expect(result.summary).not.toContain("投稿本文を入力");
      expect(postTweetNowForUserMock).not.toHaveBeenCalled();
    });
  });

  it("Test 8: each run generates again and does not freeze the first body", async () => {
    await withXEnv(async () => {
      generateMock
        .mockResolvedValueOnce({
          ok: true,
          text: "1回目の本文",
          usedFallback: false,
        })
        .mockResolvedValueOnce({
          ok: true,
          text: "2回目の本文",
          usedFallback: false,
        });
      postTweetNowForUserMock
        .mockResolvedValueOnce(readyPost("1回目の本文"))
        .mockResolvedValueOnce(readyPost("2回目の本文"));

      const configuration = { contentSource: "generate" as const };
      const first = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration,
        }),
        userId: "user_x",
        automationName: "SNS投稿の自動化",
        runId: "run_day1",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
      });
      const second = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration,
        }),
        userId: "user_x",
        automationName: "SNS投稿の自動化",
        runId: "run_day2",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
      });

      expect(first.ok).toBe(true);
      expect(second.ok).toBe(true);
      expect(generateMock).toHaveBeenCalledTimes(2);
      expect(postTweetNowForUserMock).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({ text: "1回目の本文" }),
      );
      expect(postTweetNowForUserMock).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({ text: "2回目の本文" }),
      );
      expect(configuration).toEqual({ contentSource: "generate" });
    });
  });

  it("uses run-scoped prepared text and does not regenerate", async () => {
    await withXEnv(async () => {
      postTweetNowForUserMock.mockResolvedValue(readyPost("準備済み本文"));

      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: { contentSource: "generate" },
        }),
        userId: "user_x",
        automationName: "SNS投稿の自動化",
        runId: "run_prepared",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
        generatedXPostText: "準備済み本文",
      });

      expect(result.ok).toBe(true);
      expect(generateMock).not.toHaveBeenCalled();
      expect(postTweetNowForUserMock).toHaveBeenCalledWith(
        expect.objectContaining({ text: "準備済み本文" }),
      );
    });
  });

  it("high-risk X post still requires approval before posting", async () => {
    await withXEnv(async () => {
      const result = await strictStepInvoker({
        step: step({
          id: "x",
          type: "x_post",
          name: "投稿",
          configuration: { contentSource: "generate" },
        }),
        userId: "user_x",
        automationName: "SNS投稿の自動化",
        runId: "run_unapproved",
        automationId: "auto_x",
        approved: false,
        freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
      });
      expect(result.ok).toBe(false);
      expect(result.errorCode).toBe("automation_approval_required");
      expect(postTweetNowForUserMock).not.toHaveBeenCalled();
    });
  });

  it("classifies the production NL as generate", () => {
    expect(
      classifyXPostContent({
        configuration: {},
        freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
        automationName: "SNS投稿の自動化",
      }).mode,
    ).toBe("generate");
  });
});
