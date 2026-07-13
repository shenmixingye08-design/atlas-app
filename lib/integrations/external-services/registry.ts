import type { ExternalServiceConnectorModule } from "../connector-types";
import { dropboxConnector } from "../dropbox/connector";
import { dropboxServiceDefinition } from "../dropbox/definition";
import { googleConnector } from "../google/connector";
import { googleServiceDefinition } from "../google/definition";
import { notionConnector, notionServiceDefinition } from "../notion";
import { wordpressConnector } from "../wordpress/connector";
import { wordpressServiceDefinition } from "../wordpress/definition";
import { xConnector } from "../x/connector";
import { xServiceDefinition } from "../x/definition";
import { youtubeConnector, youtubeServiceDefinition } from "../youtube";

import type {
  ExternalServiceConnection,
  ExternalServiceDefinition,
  ExternalServiceId,
  ExternalServiceView,
} from "./types";

type ConnectorEntry = {
  definition: ExternalServiceDefinition;
  connector: ExternalServiceConnectorModule;
};

const CONNECTOR_ENTRIES: readonly ConnectorEntry[] = [
  { definition: googleServiceDefinition, connector: googleConnector },
  { definition: dropboxServiceDefinition, connector: dropboxConnector },
  { definition: xServiceDefinition, connector: xConnector },
  { definition: wordpressServiceDefinition, connector: wordpressConnector },
  { definition: youtubeServiceDefinition, connector: youtubeConnector },
  { definition: notionServiceDefinition, connector: notionConnector },
];

export const externalServiceDefinitions: readonly ExternalServiceDefinition[] =
  CONNECTOR_ENTRIES.map((entry) => entry.definition);

export const externalServiceRegistry: Readonly<
  Record<ExternalServiceId, ConnectorEntry>
> = Object.fromEntries(
  CONNECTOR_ENTRIES.map((entry) => [entry.definition.serviceId, entry]),
) as Record<ExternalServiceId, ConnectorEntry>;

export function getExternalServiceDefinition(
  serviceId: ExternalServiceId,
): ExternalServiceDefinition {
  const entry = externalServiceRegistry[serviceId];
  if (!entry) {
    throw new Error(`External service not found: ${serviceId}`);
  }
  return entry.definition;
}

export function getExternalServiceConnector(
  serviceId: ExternalServiceId,
): ExternalServiceConnectorModule {
  const entry = externalServiceRegistry[serviceId];
  if (!entry) {
    throw new Error(`External service connector not found: ${serviceId}`);
  }
  return entry.connector;
}

export function createDefaultConnection(
  definition: ExternalServiceDefinition,
): ExternalServiceConnection {
  return {
    serviceId: definition.serviceId,
    serviceName: definition.serviceName,
    status: "disconnected",
    connectedAt: null,
    lastUsedAt: null,
    scopes: [],
    features: [...definition.plannedFeatures],
    errorMessage: null,
  };
}

export function mergeExternalServiceView(
  definition: ExternalServiceDefinition,
  connection: ExternalServiceConnection | null,
  featureEnabled = true,
): ExternalServiceView {
  return {
    ...definition,
    connection: connection ?? createDefaultConnection(definition),
    featureEnabled,
  };
}

export function isExternalServiceId(value: string): value is ExternalServiceId {
  return value in externalServiceRegistry;
}
