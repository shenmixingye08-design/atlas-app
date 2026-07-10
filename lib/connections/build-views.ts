import type { IntegrationProviderView } from "@/lib/integrations/types";
import {
  getConnectorProvider,
  listConnectorProviders,
} from "@/lib/connectors/definitions";
import type { ConnectorProviderId } from "@/lib/connectors";

import type {
  ConnectionCenterSnapshot,
  OAuthReadiness,
  PermissionGrant,
  PermissionGrantState,
  ProviderConnectionStatus,
  ProviderConnectionView,
} from "./types";
import { permissionKey } from "./types";

type IntegrationContext = {
  googleDriveConnected: boolean;
  googleDriveError: boolean;
  gmailConnected: boolean;
  gmailError: boolean;
  connectedLegacyIds: ReadonlySet<string>;
  errorLegacyIds: ReadonlySet<string>;
};

function buildIntegrationContext(
  integrations: readonly IntegrationProviderView[],
): IntegrationContext {
  const googleDrive = integrations.find((item) => item.id === "google_drive");
  const gmail = integrations.find((item) => item.id === "gmail");

  const connectedLegacyIds = new Set<string>();
  const errorLegacyIds = new Set<string>();

  for (const item of integrations) {
    if (item.connectionStatus === "connected") {
      connectedLegacyIds.add(item.id);
    }
    if (item.connectionStatus === "error") {
      errorLegacyIds.add(item.id);
    }
  }

  return {
    googleDriveConnected: googleDrive?.connectionStatus === "connected",
    googleDriveError: googleDrive?.connectionStatus === "error",
    gmailConnected: gmail?.connectionStatus === "connected",
    gmailError: gmail?.connectionStatus === "error",
    connectedLegacyIds,
    errorLegacyIds,
  };
}

function deriveConnectionStatus(
  providerId: ConnectorProviderId,
  ctx: IntegrationContext,
  defaultComingSoon: boolean,
): ProviderConnectionStatus {
  if (providerId === "google") {
    if (ctx.googleDriveError || ctx.gmailError) return "needs_reconnect";
    if (ctx.googleDriveConnected || ctx.gmailConnected) return "connected";
    return "not_connected";
  }

  if (providerId === "atlas") return "connected";

  const legacyMap: Partial<Record<ConnectorProviderId, string>> = {
    notion: "notion",
    slack: "slack",
    discord: "discord",
    wordpress: "wordpress",
  };

  const legacyId = legacyMap[providerId];
  if (legacyId && ctx.errorLegacyIds.has(legacyId)) {
    return "needs_reconnect";
  }
  if (legacyId && ctx.connectedLegacyIds.has(legacyId)) {
    return "connected";
  }

  if (defaultComingSoon) return "not_connected";
  return "not_connected";
}

function permissionStateForService(
  providerId: ConnectorProviderId,
  serviceId: string,
  permission: string,
  ctx: IntegrationContext,
  connectionStatus: ProviderConnectionStatus,
): PermissionGrantState {
  if (providerId === "atlas") return "granted";

  if (connectionStatus === "not_connected") return "missing";
  if (connectionStatus === "needs_reconnect") return "missing";

  if (providerId === "google") {
    if (serviceId === "google_drive" && ctx.googleDriveConnected) return "granted";
    if (serviceId === "google_docs" && ctx.googleDriveConnected) return "granted";
    if (serviceId === "google_sheets" && ctx.googleDriveConnected) return "granted";
    if (serviceId === "google_calendar" && ctx.googleDriveConnected) return "missing";
    if (serviceId === "gmail" && ctx.gmailConnected) return "granted";
    if (serviceId === "gmail" && ctx.googleDriveConnected) return "missing";
    return "missing";
  }

  if (connectionStatus === "connected") return "granted";

  return "missing";
}

function deriveOAuthReadiness(
  providerId: ConnectorProviderId,
  connectionStatus: ProviderConnectionStatus,
  hasComingSoonServices: boolean,
): OAuthReadiness {
  if (providerId === "atlas") return "ready";
  if (hasComingSoonServices && connectionStatus === "not_connected") {
    return "unavailable";
  }
  if (connectionStatus === "connected") return "ready";
  return "planned";
}

function buildPermissionGrants(
  providerId: ConnectorProviderId,
  ctx: IntegrationContext,
  connectionStatus: ProviderConnectionStatus,
): PermissionGrant[] {
  const provider = listConnectorProviders().find((item) => item.id === providerId);
  if (!provider) return [];

  return provider.services.map((service) => ({
    id: service.id,
    label: service.name,
    permission: service.permissions[0] ?? service.id,
    state: permissionStateForService(
      providerId,
      service.id,
      service.permissions[0] ?? service.id,
      ctx,
      connectionStatus,
    ),
  }));
}

/** Build Connection Center views from connector catalog + integration state. */
export function buildConnectionCenterViews(
  integrations: readonly IntegrationProviderView[] = [],
): ProviderConnectionView[] {
  const ctx = buildIntegrationContext(integrations);

  return listConnectorProviders().map((provider) => {
    const hasComingSoon = provider.services.some(
      (service) => service.status === "coming_soon",
    );
    const connectionStatus = deriveConnectionStatus(
      provider.id,
      ctx,
      provider.defaultStatus === "coming_soon",
    );
    const permissions = buildPermissionGrants(
      provider.id,
      ctx,
      connectionStatus,
    );
    const grantedCount = permissions.filter((p) => p.state === "granted").length;
    const missingCount = permissions.filter((p) => p.state === "missing").length;

    const services = provider.services.map((service) => {
      let status = service.status;
      if (
        provider.id === "google" &&
        service.id === "google_drive" &&
        ctx.googleDriveConnected
      ) {
        status = "connected";
      }
      return { id: service.id, name: service.name, status };
    });

    return {
      id: provider.id,
      name: provider.name,
      icon: provider.icon,
      description: provider.description,
      connectionStatus,
      permissions,
      grantedCount,
      missingCount,
      services,
      oauthReadiness: deriveOAuthReadiness(
        provider.id,
        connectionStatus,
        hasComingSoon,
      ),
    };
  });
}

/** Snapshot for Action Engine permission evaluation. */
export function buildConnectionCenterSnapshot(
  integrations: readonly IntegrationProviderView[] = [],
): ConnectionCenterSnapshot {
  const providers = buildConnectionCenterViews(integrations);
  const grantedKeys = new Set<string>();

  for (const provider of providers) {
    const definition = getConnectorProvider(provider.id);
    for (const grant of provider.permissions) {
      if (grant.state !== "granted" || !definition) continue;

      const service = definition.services.find((item) => item.id === grant.id);
      if (!service) {
        grantedKeys.add(permissionKey(provider.id, grant.permission));
        continue;
      }

      for (const permission of service.permissions) {
        grantedKeys.add(permissionKey(provider.id, permission));
      }
    }
  }

  grantedKeys.add(permissionKey("atlas", "internal.execute"));
  grantedKeys.add(permissionKey("atlas", "knowledge.write"));

  return { providers, grantedKeys };
}
