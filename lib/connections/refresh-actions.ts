import type { ActionRequest } from "@/lib/actions/types";
import type { ResolvedConnectorTarget } from "@/lib/connectors";

import { evaluateActionExecution } from "./evaluate-action";
import type { ConnectionCenterSnapshot } from "./types";

/** Re-evaluate Action Engine items against live connection permissions. */
export function refreshActionPermissions(
  action: ActionRequest,
  snapshot: ConnectionCenterSnapshot,
  workflowApproved: boolean,
): ActionRequest {
  const target: ResolvedConnectorTarget = {
    providerId: action.providerId,
    serviceId: action.serviceId,
    providerName: action.providerName,
    serviceName: action.targetService,
    permissions: action.requiredPermissions,
  };

  const evaluation = evaluateActionExecution(
    target,
    snapshot,
    workflowApproved,
    action.status === "completed" ? "completed" : undefined,
  );

  return {
    ...action,
    permissionStatus: evaluation.permissionStatus,
    missingPermissions: evaluation.missingPermissions,
    status: action.status === "completed" ? "completed" : evaluation.status,
    readyForExecution:
      action.status === "completed" ? true : evaluation.readyForExecution,
  };
}
