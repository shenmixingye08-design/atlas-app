import { ui } from "@/lib/i18n";

import type {
  ConnectIntegrationInput,
  Integration,
  IntegrationCatalog,
  IntegrationProviderId,
} from "./types";

export async function fetchIntegrationCatalog(): Promise<IntegrationCatalog> {
  const response = await fetch("/api/integrations", { cache: "no-store" });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? ui.error.loadFailed);
  }

  return response.json() as Promise<IntegrationCatalog>;
}

export async function connectIntegration(
  provider: IntegrationProviderId,
  name?: string,
): Promise<Integration | void> {
  if (provider === "google_drive") {
    window.location.href = "/api/external-services/google/oauth/authorize";
    return;
  }

  const body: ConnectIntegrationInput = { provider, ...(name ? { name } : {}) };

  const response = await fetch("/api/integrations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(payload.error ?? ui.error.connectFailed);
  }

  return response.json() as Promise<Integration>;
}

export async function disconnectIntegration(id: string): Promise<void> {
  const response = await fetch(`/api/integrations/${id}`, {
    method: "DELETE",
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? ui.error.disconnectFailed);
  }
}

export function formatIntegrationTimestamp(iso: string | null): string {
  if (!iso) return "—";

  return new Date(iso).toLocaleString("ja-JP", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function getGoogleDriveAuthorizePath(): string {
  return "/api/external-services/google/oauth/authorize";
}

export { INTEGRATION_ACTION_LABELS } from "./actions";
export {
  integrationProviders,
  getIntegrationProvider,
  findIntegrationProvider,
} from "./registry";
