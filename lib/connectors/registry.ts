import type { IntegrationProviderView } from "@/lib/integrations/types";

import {
  getConnectorProvider,
  getConnectorService,
  listConnectorProviders,
} from "./definitions";
import type {
  ActionConnectorRef,
  ConnectorProviderId,
  ConnectorProviderStatus,
  ConnectorProviderView,
  ConnectorServiceStatus,
  ResolvedConnectorTarget,
} from "./types";

/** Map legacy integration connections to connector provider status. */
export function mergeConnectorProviderViews(
  integrations: readonly IntegrationProviderView[] = [],
): ConnectorProviderView[] {
  const googleConnected = integrations.some(
    (item) => item.id === "google_drive" && item.connectionStatus === "connected",
  );

  return listConnectorProviders().map((provider) => {
    let status: ConnectorProviderStatus = provider.defaultStatus;

    if (provider.id === "google" && googleConnected) {
      status = "connected";
    }

    const services = provider.services.map((service) => {
      let serviceStatus: ConnectorServiceStatus = service.status;

      if (
        provider.id === "google" &&
        service.id === "google_drive" &&
        googleConnected
      ) {
        serviceStatus = "connected";
      }

      return { ...service, status: serviceStatus };
    });

    return {
      ...provider,
      status,
      services,
    };
  });
}

/** Resolve Action Engine ref → Provider → Service → permissions. */
export function resolveActionConnector(
  ref: ActionConnectorRef,
): ResolvedConnectorTarget {
  switch (ref) {
    case "publish_blog":
    case "schedule_blog_promotion":
      return resolve("wordpress", "posts");
    case "schedule_social_post":
      return resolve("meta", "threads");
    case "publish_linkedin":
      return resolve("microsoft", "outlook");
    case "send_email":
      return resolve("google", "gmail");
    case "save_google_drive":
      return resolve("google", "google_drive");
    case "executive_report":
    case "archive_research":
      return resolve("notion", "pages");
    case "persist_learning":
      return resolveAtlas("knowledge", "Knowledge");
    case "start_automation":
      return resolveAtlas("automations", "Automations");
    default:
      return resolve("wordpress", "posts");
  }
}

function resolve(
  providerId: ConnectorProviderId,
  serviceId: string,
): ResolvedConnectorTarget {
  const provider = getConnectorProvider(providerId)!;
  const service = getConnectorService(providerId, serviceId)!;

  return {
    providerId,
    serviceId,
    providerName: provider.name,
    serviceName: service.name,
    permissions: service.permissions,
  };
}

function resolveAtlas(
  serviceId: string,
  serviceName: string,
): ResolvedConnectorTarget {
  return {
    providerId: "atlas",
    serviceId,
    providerName: "MINERVOT",
    serviceName,
    permissions: ["internal.execute"],
  };
}

export function formatConnectorTarget(
  target: ResolvedConnectorTarget,
): string {
  return `${target.providerName} → ${target.serviceName}`;
}
