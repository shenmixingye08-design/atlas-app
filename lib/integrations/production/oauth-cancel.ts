import "server-only";

import {
  createDefaultConnection,
  getExternalServiceDefinition,
} from "@/lib/integrations/external-services/registry";
import { saveExternalServiceConnection } from "@/lib/integrations/external-services/store";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";
import { markOAuthCancelled } from "@/lib/integrations/production/oauth-lifecycle";

/**
 * Cancel an in-flight OAuth connect (pending → disconnected) and audit it.
 * Safe to call when the user closes the provider consent screen.
 */
export function cancelExternalServiceOAuth(input: {
  userId: string;
  serviceId: ExternalServiceId;
}): void {
  const definition = getExternalServiceDefinition(input.serviceId);
  saveExternalServiceConnection(input.userId, {
    ...createDefaultConnection(definition),
    status: "disconnected",
    errorMessage: null,
    scopes: [],
    features: [...definition.plannedFeatures],
  });

  markOAuthCancelled({
    integration: input.serviceId === "google" ? "gmail" : input.serviceId,
    userId: input.userId,
    clearPending: () => undefined,
    message: `${definition.serviceName}の認証をキャンセルしました`,
  });
}
