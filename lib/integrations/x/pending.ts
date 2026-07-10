import "server-only";

import { saveExternalServiceConnection } from "../external-services/store";
import { createDefaultConnection } from "../external-services/registry";

import { xServiceDefinition } from "./definition";

export function markXConnectionPending(userId: string): void {
  const pending = {
    ...createDefaultConnection(xServiceDefinition),
    status: "pending" as const,
    errorMessage: null,
    scopes: [...xServiceDefinition.plannedScopes],
    features: [...xServiceDefinition.plannedFeatures],
  };

  saveExternalServiceConnection(userId, pending);
}
