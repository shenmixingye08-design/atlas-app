/**
 * Preflight for Automations that include google_drive steps.
 * Active is forbidden unless Production adapter + connection are ready.
 */

import "server-only";

import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";
import { validateDriveConnection } from "@/lib/integrations/google/drive/live/connection";
import { DEFAULT_DRIVE_CONFLICT_POLICY } from "@/lib/integrations/google/drive/live/types";

export type DrivePreflightIssue = {
  stepId: string;
  errorCode: string;
  message: string;
};

export async function assertGoogleDrivePreflightForActivation(input: {
  userId: string;
  steps: ReadonlyArray<{
    id: string;
    type: string;
    enabled: boolean;
    configuration?: Readonly<Record<string, unknown>>;
  }>;
}): Promise<DrivePreflightIssue[]> {
  const driveSteps = input.steps.filter(
    (step) => step.enabled && step.type === "google_drive",
  );
  if (driveSteps.length === 0) return [];

  const issues: DrivePreflightIssue[] = [];

  if (!isLiveAdapterWired("google_drive")) {
    for (const step of driveSteps) {
      issues.push({
        stepId: step.id,
        errorCode: "live_adapter_missing",
        message: "Google Drive Production Adapterが未登録です",
      });
    }
    return issues;
  }

  const connection = await validateDriveConnection(input.userId);
  if (!connection.ready) {
    for (const step of driveSteps) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_integration_required",
        message:
          connection.message ??
          "Google Drive連携が connected ではないため有効化できません",
      });
    }
    return issues;
  }

  for (const step of driveSteps) {
    const policy = step.configuration?.conflictPolicy;
    if (
      policy != null &&
      policy !== "fail" &&
      policy !== "rename" &&
      policy !== "overwrite" &&
      policy !== "create_revision"
    ) {
      issues.push({
        stepId: step.id,
        errorCode: "automation_invalid_definition",
        message: `無効な conflictPolicy です（既定: ${DEFAULT_DRIVE_CONFLICT_POLICY}）`,
      });
    }
  }

  return issues;
}
