/**
 * V2 Automation — Gmail Production Live step (draft / send / reply).
 */

import "server-only";

import { googleGmailLiveAdapter } from "@/lib/integrations/google/gmail/live/adapter";
import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";

function isGmailDraftOnly(step: AutomationWorkflowStep): boolean {
  const mode = String(
    step.configuration.mode ?? step.configuration.action ?? "draft",
  ).toLowerCase();
  return mode === "draft" || mode === "create_draft";
}

export function gmailStepAllowsWithoutApproval(
  step: AutomationWorkflowStep,
): boolean {
  return isGmailDraftOnly(step);
}

export async function invokeGmailLiveStep(input: {
  step: AutomationWorkflowStep;
  userId: string;
  runId: string;
  approved: boolean;
  diagnosticId?: string | null;
  approvalId?: string | null;
  priorArtifacts?: AutomationRunArtifact[];
}): Promise<StepInvokeResult> {
  const configuration: Record<string, unknown> = {
    ...input.step.configuration,
  };

  // Prefer prior deliverables as attachments when none configured.
  const configuredAttachments = configuration.attachmentArtifactIds;
  const hasConfigured =
    (Array.isArray(configuredAttachments) && configuredAttachments.length > 0) ||
    typeof configuration.artifactId === "string";
  if (!hasConfigured && input.priorArtifacts?.length) {
    const deliverableIds = input.priorArtifacts
      .filter((item) => item.kind === "deliverable" && Boolean(item.id))
      .map((item) => item.id);
    if (deliverableIds.length > 0) {
      configuration.attachmentArtifactIds = deliverableIds;
    }
  }

  const result = await googleGmailLiveAdapter.execute({
    ownerId: input.userId,
    runId: input.runId,
    stepId: input.step.id,
    diagnosticId: input.diagnosticId ?? input.runId,
    configuration,
    inputBindings: input.step.inputBindings,
    approved: input.approved,
    approvalId: input.approvalId ?? null,
  });

  if (!result.ok) {
    return {
      ok: false,
      summary:
        result.connectionHealth === "missing_scope"
          ? "Gmailの権限が不足しています。再接続が必要です"
          : result.connectionHealth === "reconnect_required" ||
              result.connectionHealth === "expired" ||
              result.connectionHealth === "revoked"
            ? "Gmailの再接続が必要です"
            : result.errorCode === "gmail_invalid_recipient"
              ? "宛先が不正です"
              : result.errorCode === "gmail_attachment_failed"
                ? "添付ファイルの取得に失敗しました"
                : result.retryable
                  ? "Gmail操作を再試行します"
                  : "Gmail操作に失敗しました",
      artifacts: [],
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      failedStage: "EXTERNAL_ADAPTER_EXECUTION",
      retryable: result.retryable,
      needsUserInput: result.needsUserInput,
    };
  }

  const action = result.action;
  const externalId = action.messageId ?? action.draftId;
  if (!externalId) {
    return {
      ok: false,
      summary: "Gmailの完了証拠が不足しています",
      artifacts: [],
      errorCode: "external_action_id_required",
      errorMessage: "draftId/messageId missing after Gmail operation",
      failedStage: "EXTERNAL_RESULT_VALIDATION",
      retryable: false,
    };
  }

  if (result.awaitingApproval) {
    const draftArtifact: AutomationRunArtifact = {
      id: action.externalActionId,
      kind: "external",
      label: result.subject,
      url: action.draftId
        ? `https://mail.google.com/mail/u/0/#drafts?compose=${action.draftId}`
        : null,
      externalId: action.draftId ?? externalId,
      createdAt: action.completedAt,
    };
    return {
      ok: false,
      summary: [
        "Gmail下書きを作成しました。送信には承認が必要です。",
        `件名: ${result.subject}`,
        `宛先数: ${result.recipients.to.length}`,
        `添付数: ${action.attachmentCount}`,
      ].join(" "),
      artifacts: [draftArtifact],
      errorCode: "automation_approval_required",
      errorMessage: "Gmail送信は承認後のみ実行できます",
      failedStage: "APPROVAL",
      retryable: false,
      needsUserInput: true,
      evidence: {
        artifactIds: action.attachmentIds,
        externalActionIds: [action.draftId ?? externalId],
        externalUrls: draftArtifact.url ? [draftArtifact.url] : [],
        adapterMode: action.adapterMode,
        environment: action.environment,
        gmail: {
          service: "gmail",
          action: "draft",
          draftId: action.draftId,
          messageId: action.messageId,
          threadId: action.threadId,
          recipientHash: action.recipientHash,
          subjectHash: action.subjectHash,
          attachmentArtifactIds: action.attachmentIds,
          completedAt: action.completedAt,
          resultHash: action.resultHash,
          retryCount: action.retryCount,
          duplicatePrevented: action.duplicatePrevented,
          adapterMode: action.adapterMode,
          environment: action.environment,
          approvalId: action.approvalId,
          providerRequestId: action.providerRequestId,
          deliveryGuarantee: action.deliveryGuarantee,
        },
      },
    };
  }

  const isSend = Boolean(action.messageId) && action.action !== "draft";
  const gmailUrl = isSend
    ? `https://mail.google.com/mail/u/0/#sent/${action.threadId ?? action.messageId}`
    : action.draftId
      ? `https://mail.google.com/mail/u/0/#drafts?compose=${action.draftId}`
      : null;

  const externalArtifact: AutomationRunArtifact = {
    id: action.externalActionId,
    kind: "external",
    label: result.subject,
    url: gmailUrl,
    externalId,
    createdAt: action.completedAt,
  };

  return {
    ok: true,
    summary: action.duplicatePrevented
      ? isSend
        ? `Gmail送信済みの結果を再利用しました（messageId: ${action.messageId}）`
        : `Gmail下書き済みの結果を再利用しました（draftId: ${action.draftId}）`
      : isSend
        ? [
            "Gmailで送信しました",
            `件名: ${result.subject}`,
            `宛先数: ${result.recipients.to.length}`,
            `添付数: ${action.attachmentCount}`,
            `messageId: ${action.messageId}`,
            `実行時刻: ${action.completedAt}`,
            "（Provider受付済み。相手側配送完了は保証しません）",
          ].join(" ")
        : [
            "Gmail下書きを作成しました",
            `件名: ${result.subject}`,
            `宛先数: ${result.recipients.to.length}`,
            `添付数: ${action.attachmentCount}`,
            `draftId: ${action.draftId}`,
          ].join(" "),
    artifacts: [externalArtifact],
    evidence: {
      artifactIds: action.attachmentIds,
      externalActionIds: [externalId],
      externalUrls: gmailUrl ? [gmailUrl] : [],
      adapterMode: action.adapterMode,
      environment: action.environment,
      gmail: {
        service: "gmail",
        action: action.action,
        draftId: action.draftId,
        messageId: action.messageId,
        threadId: action.threadId,
        recipientHash: action.recipientHash,
        subjectHash: action.subjectHash,
        attachmentArtifactIds: action.attachmentIds,
        completedAt: action.completedAt,
        resultHash: action.resultHash,
        retryCount: action.retryCount,
        duplicatePrevented: action.duplicatePrevented,
        adapterMode: action.adapterMode,
        environment: action.environment,
        approvalId: action.approvalId,
        providerRequestId: action.providerRequestId,
        deliveryGuarantee: action.deliveryGuarantee,
      },
    },
  };
}
