/**
 * Required UX tests: generate-type X automations never ask the user
 * to type the tweet. needs_input is only for unresolved deixis.
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
import {
  classifyXPostContent,
  isGenerateTypeXPostPreparation,
  shouldRequestXPostUserInput,
} from "@/lib/automation-platform/execution/x-post-content";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";
import { buildCreateInputFromWizard } from "@/lib/automation-platform/wizard/builders";
import { formatRunHeadline } from "@/lib/automation-platform/operations/status-labels";
import { logXPostInstructionTrace } from "@/lib/automation-platform/execution/x-post-instruction-trace";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import { resetFeatureFlagStore, setFeatureFlagState } from "@/lib/feature-flags/store";

const postTweetNowForUserMock = vi.mocked(postTweetNowForUser);
const generateMock = vi.mocked(generateXAutomationPostText);

function step(
  configuration: Record<string, unknown> = {},
): AutomationWorkflowStep {
  return {
    id: "x",
    type: "x_post",
    name: "投稿",
    order: 0,
    inputBindings: {},
    configuration,
    requiresApproval: true,
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
      tweetId: "tw_ux_1",
      tweetUrl: "https://x.com/i/web/status/tw_ux_1",
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

describe("X generate UX — never ask the user to write the tweet", () => {
  beforeEach(() => {
    resetFeatureFlagStore();
    setFeatureFlagState("x", "on");
    postTweetNowForUserMock.mockReset();
    generateMock.mockReset();
  });

  it("Test 1: 考えて + 確認なし → generate, no input UI, auto post", async () => {
    const text =
      "MINERVOTについて文章を考えて、確認なしでXへ自動投稿して";
    const draft = proposeWizardFromNaturalLanguage(text);
    expect(draft.executionMode).toBe("run_then_notify");
    const built = buildCreateInputFromWizard({
      ...draft,
      activateOnCreate: true,
    });
    expect(built.input.executionPolicy?.mode).toBe("run_then_notify");
    expect(built.input.executionPolicy?.userAuthorizedUnattendedHighRisk).toBe(
      true,
    );

    const classified = classifyXPostContent({
      configuration: { contentSource: "generate" },
      structuredOptions: built.input.instruction?.structuredOptions,
      freeformNotes: "",
      description: "自然文からの提案です。内容を確認・修正してください。",
      automationName: "SNS投稿の自動化",
    });
    expect(classified.mode).toBe("generate");
    expect(shouldRequestXPostUserInput(classified)).toBe(false);
    expect(isGenerateTypeXPostPreparation({ contentSource: "generate" })).toBe(
      true,
    );

    await withXEnv(async () => {
      generateMock.mockResolvedValue({
        ok: true,
        text: "MINERVOTのご案内です。",
        usedFallback: false,
      });
      postTweetNowForUserMock.mockResolvedValue(
        readyPost("MINERVOTのご案内です。"),
      );
      const result = await strictStepInvoker({
        step: step({ contentSource: "generate" }),
        userId: "user_x",
        automationName: "SNS投稿の自動化",
        runId: "run_ux_1",
        automationId: "auto_x",
        approved: true,
        freeformNotes: text,
      });
      expect(result.ok).toBe(true);
      expect(result.needsUserInput).toBeFalsy();
      expect(result.summary).not.toContain("投稿する内容が確認できません");
      expect(generateMock).toHaveBeenCalled();
      expect(postTweetNowForUserMock).toHaveBeenCalled();
    });

    expect(
      formatRunHeadline({
        status: "running",
        triggerType: "manual",
        approval: { mode: "run_then_notify", status: "not_required" },
        preparation: { approvalReason: null },
      }),
    ).toBe("実行中 · 自動実行");
  });

  it("Test 2: 同じ依頼 + 実行前に確認 → generate, show copy, approve only", async () => {
    const text =
      "MINERVOTについて文章を考えて、実行前に確認してXへ投稿して";
    const draft = proposeWizardFromNaturalLanguage(text);
    expect(draft.executionMode).toBe("review_before_run");

    generateMock.mockResolvedValue({
      ok: true,
      text: "確認用の生成本文",
      usedFallback: false,
    });

    const automation = {
      name: "SNS投稿の自動化",
      description: "自然文からの提案です。内容を確認・修正してください。",
      instruction: {
        freeformNotes: "",
        structuredOptions: { originalUserRequest: text },
      },
      workflow: {
        steps: [step({ contentSource: "generate" })],
      },
    } as unknown as AutomationV2;

    const prepared = await maybePrepareXPostCopyForRun({
      automation,
      preparation: {
        summary: "承認なしで自動実行します",
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
    expect(prepared.preparation.needsInputReason).toBeNull();
    expect(prepared.preparation.summary).toContain("入力は不要です");
    expect(
      shouldRequestXPostUserInput(
        classifyXPostContent({
          configuration: { contentSource: "generate" },
          structuredOptions: { originalUserRequest: text },
        }),
      ),
    ).toBe(false);
  });

  it("Test 3: 副業について毎朝投稿を考えて → empty body is generate", () => {
    const classified = classifyXPostContent({
      configuration: {},
      freeformNotes: "副業について毎朝投稿を考えて",
      automationName: "SNS投稿の自動化",
    });
    expect(classified.mode).toBe("generate");
    expect(classified.topic).toBe("副業");
    expect(classified.text).toBe("");
    expect(shouldRequestXPostUserInput(classified)).toBe(false);
  });

  it("Test 4: これを投稿して with no referent → needs_input only", async () => {
    const classified = classifyXPostContent({
      configuration: {},
      freeformNotes: "これを投稿して",
    });
    expect(classified.mode).toBe("missing");
    expect(classified.reason).toBe("deictic_unresolved");
    expect(shouldRequestXPostUserInput(classified)).toBe(true);

    await withXEnv(async () => {
      const result = await strictStepInvoker({
        step: step({ contentSource: "unresolved" }),
        userId: "user_x",
        automationName: "投稿",
        runId: "run_ux_4",
        automationId: "auto_x",
        approved: true,
        freeformNotes: "これを投稿して",
      });
      expect(result.ok).toBe(false);
      expect(result.needsUserInput).toBe(true);
      expect(result.summary).toBe("投稿する内容が確認できません");
      expect(generateMock).not.toHaveBeenCalled();
    });
  });

  it("keeps the diagnostic logger export used by PR #336", () => {
    expect(typeof logXPostInstructionTrace).toBe("function");
  });
});
