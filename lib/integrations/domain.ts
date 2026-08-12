import { randomUUID } from "crypto";

import { getIntegrationProvider } from "./registry";
import type {
  ConnectIntegrationInput,
  Integration,
  IntegrationProviderId,
} from "./types";

export function createIntegrationFromInput(
  input: ConnectIntegrationInput,
): Integration {
  // Fail closed: never invent connected:true for unimplemented providers.
  // Real Google Drive connections use IntegrationService.completeGoogleDriveOAuth + save().
  if (input.provider !== "google_drive") {
    throw new Error(
      `この連携（${input.provider}）は現在Productionでご利用いただけません`,
    );
  }

  const provider = getIntegrationProvider(input.provider);
  const now = new Date().toISOString();

  const userId = input.userId.trim();
  if (!userId) {
    throw new Error("Integration.userId is required");
  }

  return {
    id: randomUUID(),
    userId,
    provider: input.provider,
    name: input.name?.trim() || provider.displayName,
    status: "connected",
    connected: true,
    authType: provider.authType,
    scopes: [...provider.requiredScopes],
    lastSyncAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export function isIntegrationProviderId(
  value: string,
): value is IntegrationProviderId {
  return [
    "google_drive",
    "gmail",
    "slack",
    "discord",
    "notion",
    "wordpress",
    "github",
    "webhooks",
  ].includes(value);
}
