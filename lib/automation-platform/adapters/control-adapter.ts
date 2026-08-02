import {
  emptyCostUsage,
  failResult,
  newRequestIds,
  type AutomationStepAdapter,
} from "@/lib/automation-platform/adapters/types";

export const awaitApprovalAdapter: AutomationStepAdapter = {
  type: "await_approval",
  async validateConfiguration() {
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute(context) {
    if (context.approved) {
      const ids = newRequestIds();
      const now = new Date().toISOString();
      return {
        status: "succeeded",
        startedAt: now,
        completedAt: now,
        summary: "承認済みのため続行します",
        outputBindings: {},
        artifacts: [],
        artifactIds: [],
        externalActionIds: [],
        notificationIds: [],
        requestId: ids.requestId,
        diagnosticId: ids.diagnosticId,
        retryable: false,
        errorCode: null,
        errorMessage: null,
        costUsage: emptyCostUsage(),
      };
    }
    return failResult({
      status: "needs_input",
      summary: "承認待ちです",
      errorCode: "automation_approval_required",
      errorMessage: "ユーザー承認が必要です",
    });
  },
};

export const waitAdapter: AutomationStepAdapter = {
  type: "wait",
  async validateConfiguration() {
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute() {
    const ids = newRequestIds();
    const now = new Date().toISOString();
    return {
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      summary: "待機手順を通過しました",
      outputBindings: {},
      artifacts: [],
      artifactIds: [],
      externalActionIds: [],
      notificationIds: [],
      requestId: ids.requestId,
      diagnosticId: ids.diagnosticId,
      retryable: false,
      errorCode: null,
      errorMessage: null,
      costUsage: emptyCostUsage(),
    };
  },
};

export const conditionAdapter: AutomationStepAdapter = {
  type: "condition",
  async validateConfiguration() {
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute() {
    const ids = newRequestIds();
    const now = new Date().toISOString();
    return {
      status: "succeeded",
      startedAt: now,
      completedAt: now,
      summary: "条件分岐を通過しました",
      outputBindings: {},
      artifacts: [],
      artifactIds: [],
      externalActionIds: [],
      notificationIds: [],
      requestId: ids.requestId,
      diagnosticId: ids.diagnosticId,
      retryable: false,
      errorCode: null,
      errorMessage: null,
      costUsage: emptyCostUsage(),
    };
  },
};
