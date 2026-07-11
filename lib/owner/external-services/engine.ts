import "server-only";

import { isEnvPresent, areEnvGroupsPresent } from "@/lib/env/presence";
import {
  getStripePublishableKey,
  getStripeSecretKey,
  getStripeWebhookSecret,
  isStripeConfigured,
} from "@/lib/billing/stripe/config";
import { getFeatureFlagState } from "@/lib/feature-flags/store";
import type { FeatureFlagId } from "@/lib/feature-flags/types";
import { listAllExternalServiceConnections } from "@/lib/integrations/external-services/store";
import type { ExternalServiceId } from "@/lib/integrations/external-services/types";
import { isLineMessagingConfigured } from "@/lib/integrations/line/config";
import { listLineUserLinks } from "@/lib/integrations/line/link-store";
import { getStripeWebhookMonitoringSnapshot } from "@/lib/owner/billing-webhook/service";

import {
  OWNER_EXTERNAL_SERVICE_DEFINITIONS,
  type OwnerExternalServiceDefinition,
} from "./registry";
import type {
  OwnerExternalConnectionStatus,
  OwnerExternalServiceSnapshot,
  OwnerExternalServicesSnapshot,
} from "./types";

function envPresent(...keys: string[]): boolean {
  return isEnvPresent(...keys);
}

function envAllPresent(groups: string[][]): boolean {
  return areEnvGroupsPresent(groups);
}

function isFlagApiEnabled(flagId: FeatureFlagId): boolean {
  return getFeatureFlagState(flagId) !== "off";
}

function maxIsoTimestamp(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  for (const value of values) {
    if (!value) continue;
    if (!best || value > best) best = value;
  }
  return best;
}

function aggregateUserConnections(serviceId: ExternalServiceId): {
  connectedUserCount: number;
  lastConnectedAt: string | null;
  hasConnectedUser: boolean;
} {
  const matches = listAllExternalServiceConnections().filter(
    ({ connection }) =>
      connection.serviceId === serviceId && connection.status === "connected",
  );

  return {
    connectedUserCount: matches.length,
    lastConnectedAt: maxIsoTimestamp(
      matches.map(({ connection }) => connection.connectedAt),
    ),
    hasConnectedUser: matches.length > 0,
  };
}

function listLineLinks(): Array<{ linkedAt: string }> {
  return listLineUserLinks().map((link) => ({ linkedAt: link.linkedAt }));
}

function readGoogleEnvConfigured(): boolean {
  return envAllPresent([
    ["GOOGLE_CLIENT_ID"],
    ["GOOGLE_CLIENT_SECRET"],
  ]);
}

function readGoogleOauthConfigured(): boolean {
  return (
    readGoogleEnvConfigured() &&
    envPresent("GOOGLE_REDIRECT_URI", "GOOGLE_ACCOUNT_REDIRECT_URI")
  );
}

function readDropboxEnvConfigured(): boolean {
  return envAllPresent([
    ["DROPBOX_APP_KEY", "DROPBOX_CLIENT_ID"],
    ["DROPBOX_APP_SECRET", "DROPBOX_CLIENT_SECRET"],
  ]);
}

function readDropboxOauthConfigured(): boolean {
  return (
    readDropboxEnvConfigured() &&
    envPresent("DROPBOX_REDIRECT_URI", "DROPBOX_OAUTH_REDIRECT_URI")
  );
}

function readLineEnvConfigured(): boolean {
  return isLineMessagingConfigured();
}

function readLineWebhookConfigured(): boolean {
  return envPresent(
    "LINE_CHANNEL_SECRET",
    "LINE_MESSAGING_CHANNEL_SECRET",
  );
}

function readStripeEnvConfigured(): boolean {
  return isStripeConfigured();
}

function readStripeWebhookConfigured(): boolean {
  return Boolean(getStripeWebhookSecret());
}

function buildLiveGoogleFamily(
  definition: OwnerExternalServiceDefinition,
): OwnerExternalServiceSnapshot {
  const envConfigured = readGoogleEnvConfigured();
  const oauthConfigured = readGoogleOauthConfigured();
  const apiEnabled = isFlagApiEnabled("google");
  const aggregate = aggregateUserConnections("google");
  const connectionStatus: OwnerExternalConnectionStatus = aggregate.hasConnectedUser
    ? "connected"
    : "disconnected";

  return {
    serviceId: definition.serviceId,
    label: definition.label,
    connectionStatus,
    envConfigured,
    oauthConfigured,
    webhookConfigured: null,
    apiEnabled,
    lastConnectedAt: aggregate.lastConnectedAt,
    reconnectAvailable: definition.reconnectServiceId !== null && envConfigured,
    settingsHref: definition.settingsHref,
    reconnectServiceId: definition.reconnectServiceId,
    connectedUserCount: aggregate.connectedUserCount,
  };
}

function buildDropboxSnapshot(
  definition: OwnerExternalServiceDefinition,
): OwnerExternalServiceSnapshot {
  const envConfigured = readDropboxEnvConfigured();
  const oauthConfigured = readDropboxOauthConfigured();
  const apiEnabled = isFlagApiEnabled("dropbox");
  const aggregate = aggregateUserConnections("dropbox");
  const connectionStatus: OwnerExternalConnectionStatus = aggregate.hasConnectedUser
    ? "connected"
    : "disconnected";

  return {
    serviceId: definition.serviceId,
    label: definition.label,
    connectionStatus,
    envConfigured,
    oauthConfigured,
    webhookConfigured: null,
    apiEnabled,
    lastConnectedAt: aggregate.lastConnectedAt,
    reconnectAvailable: envConfigured,
    settingsHref: definition.settingsHref,
    reconnectServiceId: definition.reconnectServiceId,
    connectedUserCount: aggregate.connectedUserCount,
  };
}

function buildLineSnapshot(
  definition: OwnerExternalServiceDefinition,
): OwnerExternalServiceSnapshot {
  const envConfigured = readLineEnvConfigured();
  const webhookConfigured = readLineWebhookConfigured();
  const links = listLineLinks();
  const lastConnectedAt = maxIsoTimestamp(links.map((link) => link.linkedAt));
  const connectionStatus: OwnerExternalConnectionStatus = envConfigured
    ? "connected"
    : "disconnected";

  return {
    serviceId: definition.serviceId,
    label: definition.label,
    connectionStatus,
    envConfigured,
    oauthConfigured: null,
    webhookConfigured,
    apiEnabled: envConfigured,
    lastConnectedAt,
    reconnectAvailable: false,
    settingsHref: definition.settingsHref,
    reconnectServiceId: null,
    connectedUserCount: links.length,
  };
}

function buildStripeSnapshot(
  definition: OwnerExternalServiceDefinition,
): OwnerExternalServiceSnapshot {
  const envConfigured = readStripeEnvConfigured();
  const webhookConfigured = readStripeWebhookConfigured();
  const monitoring = getStripeWebhookMonitoringSnapshot();
  const connectionStatus: OwnerExternalConnectionStatus = envConfigured
    ? "connected"
    : "disconnected";

  return {
    serviceId: definition.serviceId,
    label: definition.label,
    connectionStatus,
    envConfigured,
    oauthConfigured: null,
    webhookConfigured,
    apiEnabled: Boolean(getStripeSecretKey() && getStripePublishableKey()),
    lastConnectedAt: monitoring.lastSyncedAt,
    reconnectAvailable: false,
    settingsHref: definition.settingsHref,
    reconnectServiceId: null,
    connectedUserCount: 0,
  };
}

function buildUnavailableSnapshot(
  definition: OwnerExternalServiceDefinition,
): OwnerExternalServiceSnapshot {
  const notionAggregate =
    definition.connectionServiceId === "notion"
      ? aggregateUserConnections("notion")
      : null;

  return {
    serviceId: definition.serviceId,
    label: definition.label,
    connectionStatus: "disconnected",
    envConfigured: false,
    oauthConfigured: definition.supportsOauth ? false : null,
    webhookConfigured: definition.supportsWebhook ? false : null,
    apiEnabled: false,
    lastConnectedAt: notionAggregate?.lastConnectedAt ?? null,
    reconnectAvailable: false,
    settingsHref: definition.settingsHref,
    reconnectServiceId: null,
    connectedUserCount: notionAggregate?.connectedUserCount ?? 0,
  };
}

function buildServiceSnapshot(
  definition: OwnerExternalServiceDefinition,
): OwnerExternalServiceSnapshot {
  switch (definition.serviceId) {
    case "google":
    case "gmail":
    case "calendar":
    case "drive":
      return buildLiveGoogleFamily(definition);
    case "dropbox":
      return buildDropboxSnapshot(definition);
    case "line":
      return buildLineSnapshot(definition);
    case "stripe":
      return buildStripeSnapshot(definition);
    default:
      return buildUnavailableSnapshot(definition);
  }
}

export function buildOwnerExternalServicesSnapshot(
  now: Date = new Date(),
): OwnerExternalServicesSnapshot {
  const services = OWNER_EXTERNAL_SERVICE_DEFINITIONS.map(buildServiceSnapshot);
  return {
    services,
    connectedCount: services.filter(
      (service) => service.connectionStatus === "connected",
    ).length,
    generatedAt: now.toISOString(),
  };
}
