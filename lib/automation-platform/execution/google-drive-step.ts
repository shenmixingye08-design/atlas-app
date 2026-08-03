/**
 * V2 Automation — Google Drive Production Live upload step.
 */

import "server-only";

import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { googleDriveLiveAdapter } from "@/lib/integrations/google/drive/live/adapter";
import type { StepInvokeResult } from "@/lib/automation-platform/execution/step-invoker";
import type { AutomationWorkflowStep } from "@/lib/automation-platform/types/step";
import type { AutomationRunArtifact } from "@/lib/automation-platform/types/run";

function pickArtifactId(
  step: AutomationWorkflowStep,
  priorArtifacts: AutomationRunArtifact[] | undefined,
): string | null {
  const fromConfig =
    typeof step.configuration.artifactId === "string"
      ? step.configuration.artifactId.trim()
      : "";
  if (fromConfig) return fromConfig;
  const fromBinding =
    typeof step.inputBindings.artifactId === "string"
      ? String(step.inputBindings.artifactId).trim()
      : "";
  if (fromBinding) return fromBinding;

  const deliverables = (priorArtifacts ?? []).filter(
    (item) => item.kind === "deliverable" && Boolean(item.id),
  );
  if (deliverables.length === 1) return deliverables[0]!.id;
  if (deliverables.length > 1) {
    // Prefer the latest deliverable in the run.
    return deliverables[deliverables.length - 1]!.id;
  }
  return null;
}

export async function invokeGoogleDriveUploadStep(input: {
  step: AutomationWorkflowStep;
  userId: string;
  runId: string;
  diagnosticId?: string | null;
  priorArtifacts?: AutomationRunArtifact[];
}): Promise<StepInvokeResult> {
  const artifactId = pickArtifactId(input.step, input.priorArtifacts);
  if (!artifactId) {
    return {
      ok: false,
      summary: "Google Driveへ保存する成果物がありません",
      artifacts: [],
      errorCode: "automation_integration_required",
      errorMessage: "invalid artifact: artifactId missing",
      failedStage: "EXTERNAL_INPUT",
      retryable: false,
      needsUserInput: true,
    };
  }

  const artifact = await getStoredDeliverableForUser(artifactId, input.userId);
  if (!artifact) {
    return {
      ok: false,
      summary: "保存対象の成果物が見つかりません",
      artifacts: [],
      errorCode: "run_artifact_missing",
      errorMessage: "invalid artifact: not found for owner",
      failedStage: "EXTERNAL_INPUT",
      retryable: false,
      needsUserInput: true,
    };
  }

  const result = await googleDriveLiveAdapter.uploadFile({
    ownerId: input.userId,
    runId: input.runId,
    stepId: input.step.id,
    diagnosticId: input.diagnosticId ?? input.runId,
    configuration: {
      ...input.step.configuration,
      artifactId,
    },
    inputBindings: input.step.inputBindings,
    artifact,
  });

  if (!result.ok) {
    return {
      ok: false,
      summary:
        result.connectionHealth === "missing_scope"
          ? "Google Driveの権限が不足しています。再接続が必要です"
          : result.connectionHealth === "reconnect_required" ||
              result.connectionHealth === "expired" ||
              result.connectionHealth === "revoked"
            ? "Google Driveの再接続が必要です"
            : result.errorCode === "drive_folder_not_found"
              ? "保存先フォルダが見つかりません"
              : result.retryable
                ? "Google Driveへの保存を再試行します"
                : "Google Driveへの保存に失敗しました",
      artifacts: [],
      errorCode: result.errorCode,
      errorMessage: result.errorMessage,
      failedStage: "EXTERNAL_ADAPTER_EXECUTION",
      retryable: result.retryable,
      needsUserInput: result.needsUserInput,
    };
  }

  const action = result.action;
  if (!action.fileId || !action.webViewLink) {
    return {
      ok: false,
      summary: "Google Driveの完了証拠が不足しています",
      artifacts: [],
      errorCode: "external_action_id_required",
      errorMessage: "fileId/webViewLink missing after upload",
      failedStage: "EXTERNAL_RESULT_VALIDATION",
      retryable: false,
    };
  }

  const externalArtifact: AutomationRunArtifact = {
    id: action.externalActionId,
    kind: "external",
    label: action.fileName,
    url: action.webViewLink,
    externalId: action.fileId,
    createdAt: action.completedAt,
  };

  return {
    ok: true,
    summary: action.duplicatePrevented
      ? `Google Driveへ保存済みの結果を再利用しました（${action.fileName}） ${action.webViewLink}`
      : `Google Driveへ保存しました: ${action.fileName}（フォルダ: ${result.folder.folderName}） ${action.webViewLink}`,
    artifacts: [externalArtifact],
    evidence: {
      artifactIds: [artifact.id],
      externalActionIds: [action.fileId],
      externalUrls: [action.webViewLink],
      adapterMode: action.adapterMode,
      environment: action.environment,
      drive: {
        service: action.service,
        fileId: action.fileId,
        webViewLink: action.webViewLink,
        size: action.size,
        checksum: action.checksum,
        targetFolderId: action.targetFolderId,
        fileName: action.fileName,
        completedAt: action.completedAt,
        resultHash: action.resultHash,
        retryCount: action.retryCount,
        duplicatePrevented: action.duplicatePrevented,
      },
    },
  };
}
