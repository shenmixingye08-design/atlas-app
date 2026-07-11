import "server-only";

import { saveExternalServiceConnection } from "../external-services/store";
import { createDefaultConnection } from "../external-services/registry";

import { dropboxServiceDefinition } from "./definition";

export function markDropboxConnectionPending(userId: string): void {
  const pending = {
    ...createDefaultConnection(dropboxServiceDefinition),
    status: "pending" as const,
    errorMessage: null,
    scopes: [...dropboxServiceDefinition.plannedScopes],
    features: [...dropboxServiceDefinition.plannedFeatures],
  };

  saveExternalServiceConnection(userId, pending);
}
