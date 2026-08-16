import { describe, expect, it } from "vitest";

import {
  classifyXPostContent,
  interpretResumeXPostInput,
  isFillerXPostNote,
} from "@/lib/automation-platform/execution/x-post-content";
import {
  normalizeExecutionPolicy,
  resolveRunApprovalRequirement,
} from "@/lib/automation-platform/execution/policy";
import { proposeWizardFromNaturalLanguage } from "@/lib/automation-platform/wizard/nl-propose";
import { buildCreateInputFromWizard } from "@/lib/automation-platform/wizard/builders";
import { executionPolicyFromV1Level } from "@/lib/automation-platform/types/execution-policy";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";

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
    requiresApproval: true,
    retryPolicy: { maxAttempts: 1, backoffMs: [] },
    timeoutMs: 10_000,
    onSuccess: null,
    onFailure: null,
    enabled: true,
  };
}

describe("Test A — 確認なし自動実行 is saved and does not wait for approval", () => {
  it("NL 確認なしで自動実行 becomes run_then_notify + authorized", () => {
    const draft = proposeWizardFromNaturalLanguage(
      "10分後、MINERVOTについて投稿文を自分で考えてXに投稿して。確認なしで自動実行",
    );
    expect(draft.executionMode).toBe("run_then_notify");
    const built = buildCreateInputFromWizard({
      ...draft,
      activateOnCreate: true,
    });
    expect(built.input.executionPolicy?.mode).toBe("run_then_notify");
    expect(built.input.executionPolicy?.userAuthorizedUnattendedHighRisk).toBe(
      true,
    );
    const step = built.input.workflow.steps.find((item) => item.type === "x_post");
    expect(step?.configuration.contentSource).toBe("generate");
  });

  it("authorized auto X run skips system_high_risk_override", () => {
    const policy = normalizeExecutionPolicy({
      mode: "run_then_notify",
      userAuthorizedUnattendedHighRisk: true,
    });
    const result = resolveRunApprovalRequirement({
      policy,
      steps: [xStep({ contentSource: "generate" })],
      isFirstRun: true,
      priorApprovalsCount: 0,
    });
    expect(result.requiresApproval).toBe(false);
    expect(result.reason).toBe("run_then_notify");
  });
});

describe("Test B — 実行前に確認 still reviews generated copy", () => {
  it("確認したい stays review_before_run and unauthorized", () => {
    const draft = proposeWizardFromNaturalLanguage(
      "毎日MINERVOTについて投稿文を考えてXに投稿して。投稿前に確認したい",
    );
    expect(draft.executionMode).toBe("review_before_run");
    const built = buildCreateInputFromWizard(draft);
    expect(built.input.executionPolicy?.mode).toBe("review_before_run");
    expect(built.input.executionPolicy?.userAuthorizedUnattendedHighRisk).toBe(
      false,
    );
    const policy = normalizeExecutionPolicy(built.input.executionPolicy);
    const result = resolveRunApprovalRequirement({
      policy,
      steps: [xStep({ contentSource: "generate" })],
      isFirstRun: true,
      priorApprovalsCount: 0,
    });
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toBe("review_before_run");
  });
});

describe("Test C — 特になし resume is not tweet text", () => {
  it("treats 特になし as empty filler", () => {
    expect(isFillerXPostNote("特になし")).toBe(true);
    expect(interpretResumeXPostInput({ note: "特になし" })).toEqual({
      kind: "empty",
      value: "",
    });
  });

  it("keeps generate mode when stored text was 特になし", () => {
    const result = classifyXPostContent({
      configuration: { text: "特になし" },
      freeformNotes: "毎日MINERVOTについて文章を考えてXに投稿して",
    });
    expect(result.mode).toBe("generate");
    expect(result.text).toBe("");
  });

  it("does not convert generate source to fixed because of a filler note", () => {
    const result = classifyXPostContent({
      configuration: {
        contentSource: "generate",
        generateInstruction: "毎日MINERVOTについて文章を考えて投稿",
        text: "特になし",
      },
      resumeNotes: "特になし",
    });
    expect(result.mode).toBe("generate");
    expect(result.text).toBe("");
  });
});

describe("Test D — explicit 『特になし』とそのまま is fixed", () => {
  it("quotes 特になし as the real body", () => {
    const result = classifyXPostContent({
      configuration: {},
      freeformNotes: "『特になし』とそのままXに投稿して",
    });
    expect(result.mode).toBe("fixed");
    expect(result.text).toBe("特になし");
  });

  it("resume 『特になし』とそのまま is explicit_fixed", () => {
    expect(
      interpretResumeXPostInput({ note: "『特になし』とそのままXに投稿して" }),
    ).toEqual({ kind: "explicit_fixed", value: "特になし" });
  });

  it("resume 任せる / 特に指定なし stay empty", () => {
    expect(interpretResumeXPostInput({ note: "任せる" }).kind).toBe("empty");
    expect(interpretResumeXPostInput({ note: "特に指定なし" }).kind).toBe(
      "empty",
    );
  });
});

describe("Test E — confirmation toggle mapping", () => {
  it("maps V1 full_auto to authorized unattended V2 policy", () => {
    expect(executionPolicyFromV1Level("full_auto")).toEqual({
      mode: "run_then_notify",
      userAuthorizedUnattendedHighRisk: true,
    });
    expect(executionPolicyFromV1Level("approve_then_run")).toEqual({
      mode: "review_before_run",
      userAuthorizedUnattendedHighRisk: false,
    });
  });

  it("default run_then_notify without the flag still requires X approval", () => {
    const policy = normalizeExecutionPolicy({ mode: "run_then_notify" });
    expect(policy.userAuthorizedUnattendedHighRisk).toBe(false);
    const result = resolveRunApprovalRequirement({
      policy,
      steps: [xStep({ text: "hello" })],
      isFirstRun: false,
      priorApprovalsCount: 99,
    });
    expect(result.requiresApproval).toBe(true);
    expect(result.reason).toBe("system_high_risk_override");
  });
});
