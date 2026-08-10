/**
 * N-04: Canonical Production capability for external connectors.
 * UI / API / Automation / pricing must derive availability from here —
 * never invent "usable" for stub Notion / YouTube.
 */

import type { ExternalServiceId } from "@/lib/integrations/external-services/types";
import type { IntegrationProviderId } from "@/lib/integrations/types";
import type { ConnectorProviderId } from "@/lib/connectors/types";

export type ConnectorImplementation =
  | "live"
  | "stub"
  | "planned"
  | "content_only";

export type ProductionConnectorCapability = {
  serviceId: string;
  productionAvailable: boolean;
  connectable: boolean;
  automationAvailable: boolean;
  readAvailable: boolean;
  writeAvailable: boolean;
  /** When false, omit from user settings / connection catalogs. */
  userVisibleInSettings: boolean;
  implementation: ConnectorImplementation;
};

/** Explicit Production-unoffered external service APIs (N-04). */
export const PRODUCTION_UNOFFERED_EXTERNAL_SERVICES = [
  "notion",
  "youtube",
] as const;

export type ProductionUnofferedExternalService =
  (typeof PRODUCTION_UNOFFERED_EXTERNAL_SERVICES)[number];

/** User-visible strings that must not claim Notion/YouTube API is usable. */
export const FORBIDDEN_STUB_CONNECTOR_CLAIM_PATTERNS = [
  "Notion連携",
  "Notionに接続",
  "YouTube投稿",
  "YouTube連携",
  "YouTubeに接続",
  "connect to notion",
  "connect to youtube",
  "post to youtube",
] as const;

const LIVE_EXTERNAL: ProductionConnectorCapability = {
  serviceId: "",
  productionAvailable: true,
  connectable: true,
  automationAvailable: true,
  readAvailable: true,
  writeAvailable: true,
  userVisibleInSettings: true,
  implementation: "live",
};

const STUB_HIDDEN: ProductionConnectorCapability = {
  serviceId: "",
  productionAvailable: false,
  connectable: false,
  automationAvailable: false,
  readAvailable: false,
  writeAvailable: false,
  userVisibleInSettings: false,
  implementation: "stub",
};

/** Canonical map for managed ExternalServiceId values. */
const EXTERNAL_SERVICE_CAPABILITIES: Record<
  ExternalServiceId,
  ProductionConnectorCapability
> = {
  google: { ...LIVE_EXTERNAL, serviceId: "google" },
  dropbox: { ...LIVE_EXTERNAL, serviceId: "dropbox" },
  x: { ...LIVE_EXTERNAL, serviceId: "x" },
  wordpress: { ...LIVE_EXTERNAL, serviceId: "wordpress" },
  youtube: { ...STUB_HIDDEN, serviceId: "youtube" },
  notion: { ...STUB_HIDDEN, serviceId: "notion" },
};

/** Legacy integrations registry providers that are Production-connectable. */
const LIVE_INTEGRATION_PROVIDERS = new Set<IntegrationProviderId>([
  "google_drive",
  "gmail",
  "wordpress",
]);

export function isProductionUnofferedExternalService(
  serviceId: string,
): serviceId is ProductionUnofferedExternalService {
  return (PRODUCTION_UNOFFERED_EXTERNAL_SERVICES as readonly string[]).includes(
    serviceId,
  );
}

export function getExternalServiceCapability(
  serviceId: ExternalServiceId,
): ProductionConnectorCapability {
  return EXTERNAL_SERVICE_CAPABILITIES[serviceId];
}

export function isExternalServiceProductionAvailable(
  serviceId: ExternalServiceId,
): boolean {
  return getExternalServiceCapability(serviceId).productionAvailable;
}

export function isExternalServiceConnectable(
  serviceId: ExternalServiceId,
): boolean {
  return getExternalServiceCapability(serviceId).connectable;
}

export function isExternalServiceUserVisible(
  serviceId: ExternalServiceId,
): boolean {
  return getExternalServiceCapability(serviceId).userVisibleInSettings;
}

export function isExternalServiceAutomationAvailable(
  serviceId: ExternalServiceId,
): boolean {
  return getExternalServiceCapability(serviceId).automationAvailable;
}

export function getIntegrationProviderCapability(
  providerId: IntegrationProviderId,
): ProductionConnectorCapability {
  // N-04 targets Notion/YouTube. Notion is the stub in this registry.
  if (providerId === "notion") {
    return { ...STUB_HIDDEN, serviceId: "notion" };
  }
  if (LIVE_INTEGRATION_PROVIDERS.has(providerId)) {
    return { ...LIVE_EXTERNAL, serviceId: providerId };
  }
  // Other legacy providers keep prior placeholder connect paths (out of N-04).
  return {
    serviceId: providerId,
    productionAvailable: false,
    connectable: true,
    automationAvailable: false,
    readAvailable: false,
    writeAvailable: false,
    userVisibleInSettings: true,
    implementation: "planned",
  };
}

export function isIntegrationProviderConnectable(
  providerId: IntegrationProviderId,
): boolean {
  return getIntegrationProviderCapability(providerId).connectable;
}

export function isIntegrationProviderUserVisible(
  providerId: IntegrationProviderId,
): boolean {
  // Hide Notion stub from user integrations catalog (N-04).
  return providerId !== "notion";
}

export function getConnectorProviderCapability(
  providerId: ConnectorProviderId,
): ProductionConnectorCapability {
  if (providerId === "notion") {
    return { ...STUB_HIDDEN, serviceId: "notion" };
  }
  if (
    providerId === "google" ||
    providerId === "wordpress" ||
    providerId === "openai" ||
    providerId === "openrouter" ||
    providerId === "anthropic" ||
    providerId === "atlas"
  ) {
    return { ...LIVE_EXTERNAL, serviceId: providerId };
  }
  return {
    ...STUB_HIDDEN,
    serviceId: providerId,
    implementation: "planned",
    // Keep coming_soon providers visible with honest status in connectors UI.
    userVisibleInSettings: true,
  };
}

export function unsupportedExternalServiceMessage(serviceId: string): string {
  return `この連携（${serviceId}）は現在Productionでご利用いただけません`;
}

/**
 * Fail-closed connect result — never status connected / success.
 */
export function buildUnsupportedConnectFailure(input: {
  serviceId: string;
  serviceName: string;
  scopes?: readonly string[];
  features?: readonly string[];
}): {
  connection: {
    serviceId: string;
    serviceName: string;
    status: "error";
    connectedAt: null;
    lastUsedAt: null;
    scopes: readonly string[];
    features: readonly string[];
    errorMessage: string;
  };
  message: string;
  unsupported: true;
  softSuccess: false;
} {
  const message = unsupportedExternalServiceMessage(input.serviceId);
  return {
    connection: {
      serviceId: input.serviceId,
      serviceName: input.serviceName,
      status: "error",
      connectedAt: null,
      lastUsedAt: null,
      scopes: input.scopes ?? [],
      features: input.features ?? [],
      errorMessage: message,
    },
    message,
    unsupported: true,
    softSuccess: false,
  };
}

export function textClaimsForbiddenStubConnector(text: string): string[] {
  const haystack = text.toLowerCase();
  const hits: string[] = [];
  for (const pattern of FORBIDDEN_STUB_CONNECTOR_CLAIM_PATTERNS) {
    if (haystack.includes(pattern.toLowerCase())) {
      hits.push(pattern);
    }
  }
  return hits;
}
