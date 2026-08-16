import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  classifyXPostContent,
  collectXPostInstructionText,
  readOriginalUserRequest,
  stampXPostStepsWithInstruction,
  stripV1AssignmentBridgeSuffix,
} from "@/lib/automation-platform/execution/x-post-content";
import { maybePrepareXPostCopyForRun } from "@/lib/automation-platform/execution/x-post-prepare";
import { buildV1CreateInputFromV2 } from "@/lib/automation-platform/bridge/v2-to-v1-scheduler";
import { convertV1ToV2 } from "@/lib/automation-platform/migration/v1-to-v2";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";
import { buildCreateInputFromWizard } from "@/lib/automation-platform/wizard/builders";
import type { AutomationV2 } from "@/lib/automation-platform/types/automation";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { Automation as AutomationV1 } from "@/lib/automations/types";

vi.mock("@/lib/automation-platform/execution/x-post-generate", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/automation-platform/execution/x-post-generate")
  >();
  return {
    ...actual,
    generateXAutomationPostText: vi.fn(async (input) => ({
      ok: true as const,
      text: `生成:${input.classification.generateInstruction.slice(0, 40)}`,
      usedFallback: true,
    })),
  };
});

import { generateXAutomationPostText } from "@/lib/automation-platform/execution/x-post-generate";

const generateMock = vi.mocked(generateXAutomationPostText);

function xStep(
  configuration: Record<string, unknown> = {},
): AutomationWorkflowStep {
  return {
    id: "x",
    type: "x_post",
    name: "X投稿",
    order: 1,
    inputBindings: {},
    configuration,
    requiresApproval: false,
    retryPolicy: { maxAttempts: 1, backoffMs: [] },
    timeoutMs: 10_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

function automationFromNl(text: string): AutomationV2 {
  const draft = proposeWizardFromNaturalLanguage(text);
  const built = buildCreateInputFromWizard({
    ...draft,
    activateOnCreate: true,
  });
  const now = new Date().toISOString();
  return {
    id: "auto_nl",
    userId: "user_x",
    name: built.input.name,
    description: built.input.description ?? "",
    status: "active",
    trigger: built.input.trigger,
    workflow: built.input.workflow,
    executionPolicy: {
      mode: built.input.executionPolicy?.mode ?? "run_then_notify",
      systemHighRiskOverride: true,
      approvalTimeoutMs: null,
      onApprovalTimeout: "cancel",
      selectedStepIds: [],
      userAuthorizedUnattendedHighRisk:
        built.input.executionPolicy?.userAuthorizedUnattendedHighRisk,
    },
    notificationPolicy: {
      onSuccess: true,
      onFailure: true,
      beforeRun: false,
      onNeedsInput: true,
      channels: ["in_app"],
    },
    instruction: {
      freeformNotes: built.input.instruction?.freeformNotes ?? "",
      structuredOptions: built.input.instruction?.structuredOptions ?? {},
    },
    memoryPolicy: {
      enabled: false,
      allowedScopes: [],
      deniedScopes: [],
      lockedOverrides: {},
    },
    legacyAutomationId: null,
    schemaVersion: 2,
    lastRunAt: null,
    nextRunAt: null,
    createdAt: now,
    updatedAt: now,
  };
}

describe("X AI generate keeps the original NL request", () => {
  it("Test A: 元依頼だけで generate。追記なし・Memoryなし・needs_inputにしない", async () => {
    const text =
      "10分後にMINERVOTについて投稿文を考えて、確認なしでXに投稿して";
    const automation = automationFromNl(text);
    expect(automation.instruction.structuredOptions.originalUserRequest).toBe(
      text,
    );
    expect(automation.instruction.freeformNotes).toContain("MINERVOT");
    const x = automation.workflow.steps.find((step) => step.type === "x_post");
    expect(x?.configuration.contentSource).toBe("generate");
    expect(String(x?.configuration.generateInstruction)).toContain("MINERVOT");

    const classified = classifyXPostContent({
      configuration: { contentSource: "generate" },
      structuredOptions: automation.instruction.structuredOptions,
      freeformNotes: "",
      description: "自然文からの提案です。内容を確認・修正してください。",
      automationName: "SNS投稿の自動化",
    });
    expect(classified.mode).toBe("generate");
    expect(classified.generateInstruction).toContain("MINERVOT");

    const prepared = await maybePrepareXPostCopyForRun({
      automation: {
        ...automation,
        instruction: {
          ...automation.instruction,
          freeformNotes: "",
        },
      },
      preparation: {
        summary: "準備",
        plannedSteps: [],
        approvalReason: null,
        approvalStepIds: [],
        externalEffects: ["X投稿"],
        estimatedDurationLabel: "約1分",
        timezone: "Asia/Tokyo",
        scheduledLabel: "10分後",
        preparedAt: new Date().toISOString(),
      },
      resolvedInstruction: null,
    });
    expect(prepared.preparation.xPostContentMode).toBe("generate");
    expect(prepared.preparation.originalInstruction).toContain("MINERVOT");
    expect(prepared.preparation.resolvedGenerateInstruction).toContain(
      "MINERVOT",
    );
    expect(prepared.preparation.generatedXPostText).toContain("生成:");
    expect(prepared.preparation.memoryUsed).toBe(false);
    expect(prepared.preparation.contentSource).toBe("generate");
    expect(prepared.preparation.needsInputReason).toBeNull();
    expect(prepared.preparation.xPostClassifyReason).toBeTruthy();
    expect(generateMock).toHaveBeenCalled();
  });

  it("Test B: Memoryは補助。無くても同じ generate フロー", () => {
    const result = classifyXPostContent({
      configuration: { contentSource: "generate" },
      structuredOptions: {
        originalUserRequest: "毎日MINERVOTについて投稿文を考えてXへ投稿して",
      },
      freeformNotes: "",
      resolvedNotes: "短め・絵文字なし",
      automationName: "SNS投稿の自動化",
    });
    expect(result.mode).toBe("generate");
    expect(result.generateInstruction).toContain("MINERVOT");
    expect(result.generateInstruction).toContain("短め");
  });

  it("Test C: topic だけで完成本文がなくても generate", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "副業について毎日投稿を考えて",
      automationName: "SNS投稿の自動化",
    });
    expect(result.mode).toBe("generate");
    expect(result.topic).toBe("副業");
  });

  it("Test D: これをXに投稿して + 参照なし だけ needs_input", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "これをXに投稿して",
      automationName: "SNS投稿の自動化",
    });
    expect(result.mode).toBe("missing");
    expect(result.reason).toBe("deictic_unresolved");
    expect(result.generateInstruction).toContain("これをXに投稿して");
  });

  it("Test E: 追記は本文にせず、元instruction＋追加条件で generate", () => {
    const instruction = collectXPostInstructionText({
      configuration: {
        contentSource: "generate",
        generateInstruction: "MINERVOTについて投稿して",
      },
      freeformNotes: "MINERVOTについて投稿して",
      resumeNotes: "初心者にも分かるように短めで",
      automationName: "SNS投稿の自動化",
    });
    expect(instruction).toContain("MINERVOTについて投稿して");
    expect(instruction).toContain("追加条件: 初心者にも分かるように短めで");
    const classified = classifyXPostContent({
      configuration: { contentSource: "generate" },
      freeformNotes: "MINERVOTについて投稿して",
      resumeNotes: "初心者にも分かるように短めで",
    });
    expect(classified.mode).toBe("generate");
    expect(classified.text).toBe("");
    expect(classified.generateInstruction).toContain("追加条件");
  });

  it("Test F: V2 → V1 assignment に元依頼が残る / V1 → V2 でも保持", () => {
    const v2 = automationFromNl(
      "毎日MINERVOTについて違う文章を作ってXへ投稿して",
    );
    const v1Input = buildV1CreateInputFromV2(v2);
    expect(v1Input?.workflow.assignment).toContain("MINERVOT");
    expect(v1Input?.workflow.assignment).toContain("やること:");

    const recovered = stripV1AssignmentBridgeSuffix(
      v1Input?.workflow.assignment ?? "",
    );
    expect(recovered).toContain("MINERVOT");
    expect(recovered).not.toContain("やること:");

    const v1 = {
      id: "v1-shadow",
      name: "SNS投稿の自動化",
      description: "",
      schedule: {
        kind: "schedule",
        preset: { type: "daily", hour: 9, minute: 0 },
        timezone: "Asia/Tokyo",
        label: "毎日",
      },
      workflow: { assignment: recovered },
      timing: { startDate: null, endCondition: { type: "never" } },
      executionLevel: "full_auto",
      executionMode: "standard",
      snsBatchDays: null,
      executionFlow: {
        templateId: "sns_post",
        steps: [{ id: "publish", enabled: true }],
      },
      destination: "x",
      enabled: true,
      lastRun: null,
      nextRun: null,
      status: "idle",
      lastWorkflowRunId: null,
      lastError: null,
      userId: "user_x",
      successCount: 0,
      failureCount: 0,
      runHistory: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as AutomationV1;
    const converted = convertV1ToV2(v1);
    expect(converted.record.instruction.freeformNotes).toContain("MINERVOT");
    expect(
      converted.record.instruction.structuredOptions.originalUserRequest,
    ).toContain("MINERVOT");
  });

  it("treats topic-only NL as generate, not needs_input", () => {
    for (const text of [
      "毎日MINERVOTについて投稿して",
      "今日のAIニュースについて投稿して",
      "自分のサービスについて宣伝投稿を作って",
      "内容はMINERVOTに任せて投稿して",
    ]) {
      const result = classifyXPostContent({
        configuration: {},
        freeformNotes: text,
        automationName: "SNS投稿の自動化",
      });
      expect(result.mode, text).toBe("generate");
    }
  });

  it("does not treat the generic title as enough instruction", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "",
      description: "自然文からの提案です。内容を確認・修正してください。",
      automationName: "SNS投稿の自動化",
    });
    expect(result.mode).toBe("missing");
  });

  it("recovers generate from originalUserRequest when notes were cleared", () => {
    expect(
      readOriginalUserRequest({
        structuredOptions: {
          originalUserRequest:
            "今日のAIニュースについて投稿して",
        },
        freeformNotes: "",
        description: "自然文からの提案です。内容を確認・修正してください。",
      }),
    ).toContain("AIニュース");

    const stamped = stampXPostStepsWithInstruction(
      [xStep({})],
      "自分のサービスについて宣伝投稿を作って",
    );
    expect(stamped[0]?.configuration.contentSource).toBe("generate");
    expect(String(stamped[0]?.configuration.generateInstruction)).toContain(
      "サービス",
    );
  });
});
