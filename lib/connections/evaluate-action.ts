import type { ResolvedConnectorTarget } from "@/lib/connectors";

import type {
  ActionExecutionEvaluation,
  ActionPermissionStatus,
  ConnectionCenterSnapshot,
} from "./types";
import { permissionKey } from "./types";

function allPermissionsGranted(
  target: ResolvedConnectorTarget,
  snapshot: ConnectionCenterSnapshot,
): { granted: boolean; missing: string[] } {
  if (target.providerId === "atlas") {
    return { granted: true, missing: [] };
  }

  const missing: string[] = [];

  for (const permission of target.permissions) {
    const key = permissionKey(target.providerId, permission);
    if (!snapshot.grantedKeys.has(key)) {
      missing.push(permission);
    }
  }

  return { granted: missing.length === 0, missing };
}

/** Determine whether an action is executable based on permissions. */
export function evaluateActionExecution(
  target: ResolvedConnectorTarget,
  snapshot: ConnectionCenterSnapshot,
  workflowApproved: boolean,
  statusOverride?: "completed",
): ActionExecutionEvaluation {
  if (statusOverride === "completed") {
    return {
      permissionStatus: "ready",
      readyForExecution: true,
      status: "completed",
      missingPermissions: [],
    };
  }

  const { granted, missing } = allPermissionsGranted(target, snapshot);

  if (!workflowApproved) {
    return {
      permissionStatus: granted ? "ready" : "permission_required",
      readyForExecution: false,
      status: "waiting",
      missingPermissions: missing,
    };
  }

  if (granted) {
    return {
      permissionStatus: "ready",
      readyForExecution: true,
      status: "ready",
      missingPermissions: [],
    };
  }

  return {
    permissionStatus: "permission_required",
    readyForExecution: false,
    status: "waiting",
    missingPermissions: missing,
  };
}
