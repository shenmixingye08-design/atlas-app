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
  const provider = getIntegrationProvider(input.provider);
  const now = new Date().toISOString();

  return {
    id: randomUUID(),
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
