/**
 * V2 Automation — WordPress Production Live step (draft / publish / update).
 */

import "server-only";

import { wordpressLiveAdapter } from "@/lib/integrations/wordpress/live/adapter";
import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";

function isWordPressDraftOnly(step: AutomationWorkflowStep): boolean {
  const publishMode = String(step.configuration.publishMode ?? "").toLowerCase();
  if (publishMode === "draft") return true;
  const mode = String(
    step.configuration.mode ?? step.configuration.action ?? "draft",
  ).toLowerCase();
  return (
    mode === "draft" ||
    mode === "create_draft" ||
    mode === "save_draft" ||
    mode === "update"
  );
}

export function wordpressStepAllowsWithoutApproval(
  step: AutomationWorkflowStep,
): boolean {
  return isWordPressDraftOnly(step);
}

function pickFeaturedArtifactId(
  step: AutomationWorkflowStep,
  priorArtifacts?: AutomationRunArtifact[],
): string | null {
  const fromConfig =
    typeof step.configuration.featuredImageArtifactId === "string"
      ? step.configuration.featuredImageArtifactId.trim()
      : typeof step.configuration.featuredMediaArtifactId === "string"
        ? step.configuration.featuredMediaArtifactId.trim()
        : typeof step.configuration.artifactId === "string"
          ? step.configuration.artifactId.trim()
          : "";
  if (fromConfig) return fromConfig;

  const deliverables = (priorArtifacts ?? []).filter(
    (item) => item.kind === "deliverable" && Boolean(item.id),
  );
  if (deliverables.length === 1) return deliverables[0]!.id;
  if (deliverables.length > 1) {
    return deliverables[deliverables.length - 1]!.id;
  }
  return null;
}

export async function invokeWordPressLiveStep(input: {
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

  const featuredId = pickFeaturedArtifactId(input.step, input.priorArtifacts);
  if (featuredId && !configuration.featuredImageArtifactId) {
    configuration.featuredImageArtifactId = featuredId;
  }

  const result = await wordpressLiveAdapter.execute({
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
        result.connectionHealth === "auth_failure"
          ? "WordPress認証に失敗しました。再接続が必要です"
          : result.connectionHealth === "reconnect_required" ||
              result.connectionHealth === "disconnected"
            ? "WordPressの再接続が必要です"
            : result.errorCode === "wordpress_invalid_input"
              ? "タイトルまたは本文が不正です"
              : result.errorCode === "wordpress_media_failed"
                ? "アイキャッチ画像の取得に失敗しました"
                : result.errorCode === "wordpress_approval_required"
                  ? "WordPress公開は承認後のみ実行できます"
                  : result.retryable
                    ? "WordPress操作を再試行します"
                    : "WordPress操作に失敗しました",
      artifacts: [],
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      failedStage: "EXTERNAL_ADAPTER_EXECUTION",
      retryable: result.retryable,
      needsUserInput: result.needsUserInput,
    };
  }

  const action = result.action;
  if (!action.postId || !action.link || !action.editLink) {
    return {
      ok: false,
      summary: "WordPressの完了証拠が不足しています",
      artifacts: [],
      errorCode: "external_action_id_required",
      errorMessage: "postId/link/editLink missing after WordPress operation",
      failedStage: "EXTERNAL_RESULT_VALIDATION",
      retryable: false,
    };
  }

  if (result.awaitingApproval) {
    const draftArtifact: AutomationRunArtifact = {
      id: action.externalActionId,
      kind: "external",
      label: result.title,
      url: action.editLink,
      externalId: String(action.postId),
      createdAt: action.completedAt,
    };
    return {
      ok: false,
      summary: [
        "WordPress下書きを作成しました。公開には承認が必要です。",
        `タイトル: ${result.title}`,
        `postId: ${action.postId}`,
        `編集: ${action.editLink}`,
      ].join(" "),
      artifacts: [draftArtifact],
      errorCode: "automation_approval_required",
      errorMessage: "WordPress公開は承認後のみ実行できます",
      failedStage: "APPROVAL",
      retryable: false,
      needsUserInput: true,
      evidence: {
        artifactIds: action.mediaArtifactIds,
        externalActionIds: [String(action.postId)],
        externalUrls: [action.link, action.editLink],
        adapterMode: action.adapterMode,
        environment: action.environment,
        wordpress: {
          service: "wordpress",
          action: "draft",
          postId: action.postId,
          postStatus: action.postStatus,
          link: action.link,
          editLink: action.editLink,
          titleHash: action.titleHash,
          contentHash: action.contentHash,
          mediaArtifactIds: action.mediaArtifactIds,
          mediaIds: action.mediaIds,
          completedAt: action.completedAt,
          resultHash: action.resultHash,
          retryCount: action.retryCount,
          duplicatePrevented: action.duplicatePrevented,
          adapterMode: action.adapterMode,
          environment: action.environment,
          approvalId: action.approvalId,
          providerRequestId: action.providerRequestId,
        },
      },
    };
  }

  const externalArtifact: AutomationRunArtifact = {
    id: action.externalActionId,
    kind: "external",
    label: result.title,
    url: action.action === "publish" ? action.link : action.editLink,
    externalId: String(action.postId),
    createdAt: action.completedAt,
  };

  const isPublished =
    action.action === "publish" && action.postStatus === "publish";

  return {
    ok: true,
    summary: action.duplicatePrevented
      ? `WordPress済みの結果を再利用しました（postId: ${action.postId}）`
      : isPublished
        ? [
            "WordPressに公開しました",
            `タイトル: ${result.title}`,
            `postId: ${action.postId}`,
            `URL: ${action.link}`,
            `実行時刻: ${action.completedAt}`,
          ].join(" ")
        : action.action === "update"
          ? [
              "WordPressの記事を更新しました",
              `タイトル: ${result.title}`,
              `postId: ${action.postId}`,
              `編集: ${action.editLink}`,
            ].join(" ")
          : [
              "WordPressに下書き保存しました",
              `タイトル: ${result.title}`,
              `postId: ${action.postId}`,
              `編集: ${action.editLink}`,
            ].join(" "),
    artifacts: [externalArtifact],
    evidence: {
      artifactIds: action.mediaArtifactIds,
      externalActionIds: [String(action.postId)],
      externalUrls: [action.link, action.editLink],
      adapterMode: action.adapterMode,
      environment: action.environment,
      wordpress: {
        service: "wordpress",
        action: action.action,
        postId: action.postId,
        postStatus: action.postStatus,
        link: action.link,
        editLink: action.editLink,
        titleHash: action.titleHash,
        contentHash: action.contentHash,
        mediaArtifactIds: action.mediaArtifactIds,
        mediaIds: action.mediaIds,
        completedAt: action.completedAt,
        resultHash: action.resultHash,
        retryCount: action.retryCount,
        duplicatePrevented: action.duplicatePrevented,
        adapterMode: action.adapterMode,
        environment: action.environment,
        approvalId: action.approvalId,
        providerRequestId: action.providerRequestId,
      },
    },
  };
}
