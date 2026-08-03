/**
 * Preflight for Automations that include dropbox steps.
 * Active is forbidden unless Production adapter + connection are ready.
 */

import "server-only";

import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { validateDropboxConnection } from "@/lib/integrations/dropbox/live/connection";
import { DEFAULT_DROPBOX_CONFLICT_POLICY } from "@/lib/integrations/dropbox/live/types";

export type DropboxPreflightIssue = {
  stepId: string;
  errorCode: string;
  message: string;
};

export async function assertDropboxPreflightForActivation(input: {
  userId: string;
  steps: ReadonlyArray<{
    id: string;
    type: string;
    enabled: boolean;
    configuration?: Readonly<Record<string, unknown>>;
  }>;
}): Promise<DropboxPreflightIssue[]> {
  const dropboxSteps = input.steps.filter(
    (step) => step.enabled && step.type === "dropbox",
  );
  if (dropboxSteps.length === 0) return [];

  const issues: DropboxPreflightIssue[] = [];

  if (!isLiveAdapterWired("dropbox")) {
    for (const step of dropboxSteps) {
      issues.push({
        stepId: step.id,
        errorCode: "live_adapter_missing",
        message: "Dropbox Production Adapterが未登録です",
      });
    }
    return issues;
  }

  const connection = await validateDropboxConnection(input.userId);
  if (!connection.ready) {
    for (const step of dropboxSteps) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_integration_required",
        message:
          connection.message ??
          "Dropbox連携が connected ではないため有効化できません",
      });
    }
    return issues;
  }

  for (const step of dropboxSteps) {
    const dest =
      typeof step.configuration?.saveTarget === "string"
        ? step.configuration.saveTarget.trim()
        : typeof step.configuration?.folderPath === "string"
          ? step.configuration.folderPath.trim()
          : "";
    if (!dest) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message: "Dropboxの保存先フォルダを選択してください",
      });
    }

    const policy = step.configuration?.conflictPolicy;
    if (
      policy != null &&
      policy !== "fail" &&
      policy !== "rename" &&
      policy !== "overwrite" &&
      policy !== "autorename" &&
      policy !== "revision"
    ) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message: `無効な conflictPolicy です（既定: ${DEFAULT_DROPBOX_CONFLICT_POLICY}）`,
      });
    }
  }

  return issues;
}
