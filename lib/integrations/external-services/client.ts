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

export function formatExternalConnectClientError(
  body:
    | {
        error?: string;
        message?: string;
        diagnosticId?: string;
      }
    | null,
): string {
  const base =
    body?.error?.trim() ||
    body?.message?.trim() ||
    "連携を開始できませんでした。自動で再試行しています。";
  const diagnosticId = body?.diagnosticId?.trim();
  if (diagnosticId && !base.includes(diagnosticId)) {
    return `${base}（診断ID: ${diagnosticId}）`;
  }
  return base;
}

export async function fetchExternalServiceCatalog(): Promise<ExternalServiceCatalog> {
  const response = await fetch("/api/external-services", { cache: "no-store" });
  if (!response.ok) {
    throw new Error("Failed to load external services");
  }
  return response.json() as Promise<ExternalServiceCatalog>;
}

export async function connectExternalService(
  serviceId: ExternalServiceId,
  options?: { returnTo?: string },
): Promise<ExternalServiceConnectResult> {
  const response = await fetch(`/api/external-services/${serviceId}/connect`, {
    method: "POST",
    ...(options?.returnTo
      ? {
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ returnTo: options.returnTo }),
        }
      : {}),
  });
  const body = (await response.json().catch(() => null)) as
    | (ExternalServiceConnectResult & {
        error?: string;
        message?: string;
        requiredPlanName?: string;
      })
    | null;

  if (!response.ok) {
    const { formatPlanAccessErrorMessage, isPlanAccessErrorPayload } =
      await import("@/lib/billing/client-errors");
    if (isPlanAccessErrorPayload(body)) {
      throw new Error(formatPlanAccessErrorMessage(body));
    }
    throw new Error(
      formatExternalConnectClientError(
        body as {
          error?: string;
          message?: string;
          diagnosticId?: string;
        } | null,
      ),
    );
  }

  const result = body as ExternalServiceConnectResult;

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
