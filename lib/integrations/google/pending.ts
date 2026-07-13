import "server-only";

import {
  getExternalServiceConnection,
  saveExternalServiceConnection,
} from "../external-services/store";
import { createDefaultConnection } from "../external-services/registry";
import { googleServiceDefinition } from "./definition";

export function markGoogleConnectionPending(userId: string): void {
  const current = getExternalServiceConnection(userId, "google");
  const pending = {
    ...createDefaultConnection(googleServiceDefinition),
    status: "pending" as const,
    connectedAt: current.connectedAt,
    lastUsedAt: current.lastUsedAt,
    errorMessage: null,
    scopes: [...googleServiceDefinition.plannedScopes],
    features: [...googleServiceDefinition.plannedFeatures],
    account: current.account,
  };

  saveExternalServiceConnection(userId, pending);
}
