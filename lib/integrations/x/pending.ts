import "server-only";

import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "../external-services/store";
import { createDefaultConnection } from "../external-services/registry";

import { xServiceDefinition } from "./definition";

export function markXConnectionPending(userId: string): void {
  const current = getExternalServiceConnection(userId, "x");
  const pending = {
    ...createDefaultConnection(xServiceDefinition),
    status: "pending" as const,
    connectedAt: current.connectedAt,
    lastUsedAt: current.lastUsedAt,
    errorMessage: null,
    scopes: [...xServiceDefinition.plannedScopes],
    features: [...xServiceDefinition.plannedFeatures],
    account: current.account,
  };

  saveExternalServiceConnection(userId, pending);
}
