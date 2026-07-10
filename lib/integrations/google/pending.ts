import "server-only";

import { saveExternalServiceConnection } from "../external-services/store";
import { createDefaultConnection } from "../external-services/registry";
import { googleServiceDefinition } from "./definition";

export function markGoogleConnectionPending(userId: string): void {
  const pending = {
    ...createDefaultConnection(googleServiceDefinition),
    status: "pending" as const,
    errorMessage: null,
    scopes: [...googleServiceDefinition.plannedScopes],
    features: [...googleServiceDefinition.plannedFeatures],
  };

  saveExternalServiceConnection(userId, pending);
}
