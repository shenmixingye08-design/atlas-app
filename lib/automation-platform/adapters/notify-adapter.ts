import "server-only";

import {
  emptyCostUsage,
  failResult,
  newRequestIds,
  type AutomationStepAdapter,
  type StepExecutionResult,
} from "@/lib/automation-platform/adapters/types";
import {
  buildNotificationDeliveryKey,
  completeIdempotencyRecord,
  reserveIdempotencyKey,
} from "@/lib/automation-platform/adapters/idempotency-store";
import { createNotification } from "@/lib/notifications/service";

export const notifyAdapter: AutomationStepAdapter = {
  type: "notify",
  async validateConfiguration() {
    return { ok: true, code: "ok", message: "ok" };
  },
  async execute(context): Promise<StepExecutionResult> {
    const startedAt = new Date().toISOString();
    const ids = newRequestIds();
    const key = buildNotificationDeliveryKey({
      runId: context.runId,
      stepId: context.step.id,
      channel: "in_app",
    });
    const reserved = await reserveIdempotencyKey({
      userId: context.userId,
      key,
      kind: "notification",
      runId: context.runId,
      stepId: context.step.id,
    });
    if (!reserved.created && reserved.record.externalActionId) {
      return {
        status: "succeeded",
        startedAt,
        completedAt: new Date().toISOString(),
        summary: "通知は既に配信済みです（重複防止）",
        outputBindings: {
          notificationId: reserved.record.externalActionId,
        },
        artifacts: [],
        artifactIds: [],
        externalActionIds: [],
        notificationIds: [reserved.record.externalActionId],
        requestId: ids.requestId,
        diagnosticId: ids.diagnosticId,
        retryable: false,
        errorCode: null,
        errorMessage: null,
        costUsage: emptyCostUsage(),
      };
    }

    const title =
      (typeof context.step.configuration.title === "string" &&
        context.step.configuration.title.trim()) ||
      `${context.automationName} が完了しました`;
    const message =
      (typeof context.step.configuration.message === "string" &&
        context.step.configuration.message.trim()) ||
      "自動化の手順が完了しました。";

    const record = createNotification({
      audience: "user",
      userId: context.userId,
      type: "automation_completed",
      title,
      message,
      actionUrl: `/automations/runs/${encodeURIComponent(context.runId)}`,
      automationId: context.automationId,
      workflowRunId: context.runId,
      requestId: ids.requestId,
      targetType: "automation_run",
      targetId: context.runId,
    });

    if (!record) {
      return failResult({
        status: "failed",
        summary: "アプリ内通知の保存に失敗しました",
        errorCode: "automation_run_failed",
        errorMessage: "createNotification returned null",
        retryable: true,
        startedAt,
      });
    }

    await completeIdempotencyRecord({
      userId: context.userId,
      key,
      externalActionId: record.id,
    });

    return {
      status: "succeeded",
      startedAt,
      completedAt: new Date().toISOString(),
      summary: "アプリ内通知を保存しました",
      outputBindings: { notificationId: record.id },
      artifacts: [],
      artifactIds: [],
      externalActionIds: [],
      notificationIds: [record.id],
      requestId: ids.requestId,
      diagnosticId: ids.diagnosticId,
      retryable: false,
      errorCode: null,
      errorMessage: null,
      costUsage: emptyCostUsage(),
    };
  },
};
