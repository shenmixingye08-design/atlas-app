import type {
  ExternalServiceCatalog,
  ExternalServiceConnectResult,
  ExternalServiceConnection,
  ExternalServiceId,
} from "./types";

export type {
  ExternalServiceCatalog,
  ExternalServiceConnection,
  ExternalServiceId,
  ExternalServiceStatus,
  ExternalServiceView,
} from "./types";

export {
  externalServiceDefinitions,
  getExternalServiceDefinition,
  isExternalServiceId,
} from "./registry";

export async function fetchExternalServiceCatalog(): Promise<ExternalServiceCatalog> {
  const response = await fetch("/api/external-services", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load external services");
  }
  return response.json() as Promise<ExternalServiceCatalog>;
}

export async function connectExternalService(
  serviceId: ExternalServiceId,
): Promise<ExternalServiceConnectResult> {
  const response = await fetch(`/api/external-services/${serviceId}/connect`, {
    method: "POST",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to connect external service");
  }

  const result = (await response.json()) as ExternalServiceConnectResult;

  if (result.authorizeUrl && typeof window !== "undefined") {
    window.location.assign(result.authorizeUrl);
  }

  return result;
}

export async function disconnectExternalService(
  serviceId: ExternalServiceId,
): Promise<ExternalServiceConnection> {
  const response = await fetch(`/api/external-services/${serviceId}`, {
    method: "DELETE",
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      error?: string;
    } | null;
    throw new Error(body?.error ?? "Failed to disconnect external service");
  }
  return response.json() as Promise<ExternalServiceConnection>;
}

export function formatExternalServiceTimestamp(
  value: string | null,
): string {
  if (!value) return "—";
  try {
    return new Intl.DateTimeFormat("ja-JP", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}
