import "server-only";

import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getExternalServiceCredentials } from "@/lib/integrations/external-services/credential-store";
import {
  LIVE_CONNECT_HREFS,
  LIVE_OAUTH_AUTHORIZE,
  LIVE_SERVICE_LABELS,
  type LiveConnectionStatus,
  type LiveIntegrationServiceId,
  type LiveIntegrationStatus,
  type LiveIntegrationsDashboard,
} from "@/lib/live-integrations/types";

type ExternalServiceKey = "google" | "dropbox" | "wordpress" | "x";

const REQUIRED_SCOPE_HINTS: Partial<
  Record<LiveIntegrationServiceId, string[]>
> = {
  gmail: ["gmail"],
  google_calendar: ["calendar"],
  x: ["tweet.write", "tweet.read"],
};

function serviceToExternalKey(
  serviceId: LiveIntegrationServiceId,
): ExternalServiceKey {
  if (serviceId === "gmail" || serviceId === "google_calendar") return "google";
  return serviceId;
}

function detectInsufficientScope(
  serviceId: LiveIntegrationServiceId,
  scopes: readonly string[],
  scopesMissingHint: string[],
): string[] {
  if (scopesMissingHint.length > 0) return scopesMissingHint;
  const hints = REQUIRED_SCOPE_HINTS[serviceId] ?? [];
  if (hints.length === 0 || scopes.length === 0) return [];
  const joined = scopes.join(" ").toLowerCase();
  return hints.filter((hint) => !joined.includes(hint.toLowerCase()));
}

function mapConnectionStatus(input: {
  raw: string | undefined;
  errorMessage: string | null;
  insufficientScope: boolean;
  tokenExpired: boolean;
}): LiveConnectionStatus {
  if (input.insufficientScope) return "insufficient_scope";
  if (input.tokenExpired) return "expired";
  if (!input.raw || input.raw === "disconnected" || input.raw === "pending") {
    return "not_connected";
  }
  if (input.raw === "error") {
    const msg = (input.errorMessage ?? "").toLowerCase();
    if (msg.includes("expired") || msg.includes("invalid_grant")) {
      return "expired";
    }
    return "needs_reconnect";
  }
  if (input.raw === "connected") return "connected";
  return "error";
}

function isCredentialExpired(expiresAt: string | undefined): boolean {
  if (!expiresAt) return false;
  const ms = Date.parse(expiresAt);
  if (Number.isNaN(ms)) return false;
  // No refresh token path is handled by providers; here flag near-expiry only
  // when expiresAt is in the past and status is still connected.
  return ms < Date.now();
}

/**
 * Build live status for one service from durable connection metadata.
 * Does not expose tokens.
 */
export async function getLiveIntegrationStatus(
  userId: string,
  serviceId: LiveIntegrationServiceId,
  options?: {
    automationCount?: number;
    scopesMissing?: string[];
  },
): Promise<LiveIntegrationStatus> {
  await ensureExternalAuthHydrated(userId);
  const key = serviceToExternalKey(serviceId);
  const connection = getExternalServiceConnection(userId, key);
  const credentials = getExternalServiceCredentials(userId, key);

  const scopesGranted = [
    ...(connection.scopes ?? []),
    ...(typeof credentials?.scope === "string"
      ? credentials.scope.split(/[\s,]+/).filter(Boolean)
      : []),
  ];

  const scopesMissing = detectInsufficientScope(
    serviceId,
    scopesGranted,
    options?.scopesMissing ?? [],
  );

  const tokenExpired =
    connection.status === "connected" &&
    isCredentialExpired(credentials?.expiresAt) &&
    !credentials?.refreshToken;

  const status = mapConnectionStatus({
    raw: connection.status,
    errorMessage: connection.errorMessage,
    insufficientScope:
      scopesMissing.length > 0 && connection.status === "connected",
    tokenExpired,
  });

  let message = "";
  switch (status) {
    case "connected":
      message = `${LIVE_SERVICE_LABELS[serviceId]}に接続済みです`;
      break;
    case "not_connected":
      message = `${LIVE_SERVICE_LABELS[serviceId]}が未接続です。接続してください`;
      break;
    case "expired":
      message = `${LIVE_SERVICE_LABELS[serviceId]}の認証の期限が切れました。再接続してください`;
      break;
    case "needs_reconnect":
      message = `${LIVE_SERVICE_LABELS[serviceId]}の再接続が必要です`;
      break;
    case "insufficient_scope":
      message = `${LIVE_SERVICE_LABELS[serviceId]}の権限が不足しています`;
      break;
    case "feature_disabled":
      message = `${LIVE_SERVICE_LABELS[serviceId]}は現在ご利用いただけません`;
      break;
    default:
      message = `${LIVE_SERVICE_LABELS[serviceId]}でエラーが発生しています`;
  }

  const lastUsedAt = connection.lastUsedAt ?? null;

  return {
    serviceId,
    label: LIVE_SERVICE_LABELS[serviceId],
    status,
    message,
    reconnectHref:
      status === "needs_reconnect" ||
      status === "expired" ||
      status === "insufficient_scope"
        ? LIVE_OAUTH_AUTHORIZE[serviceId] ?? LIVE_CONNECT_HREFS[serviceId]
        : null,
    connectHref:
      status === "not_connected"
        ? LIVE_OAUTH_AUTHORIZE[serviceId] ?? LIVE_CONNECT_HREFS[serviceId]
        : LIVE_CONNECT_HREFS[serviceId],
    lastUsedAt,
    automationCount: options?.automationCount ?? 0,
    scopesGranted,
    scopesMissing,
    checkedAt: new Date().toISOString(),
  };
}

export async function listLiveIntegrationStatuses(
  userId: string,
  automationCounts?: Partial<Record<LiveIntegrationServiceId, number>>,
): Promise<LiveIntegrationStatus[]> {
  const ids: LiveIntegrationServiceId[] = [
    "gmail",
    "google_calendar",
    "dropbox",
    "wordpress",
    "x",
  ];
  const rows: LiveIntegrationStatus[] = [];
  for (const id of ids) {
    rows.push(
      await getLiveIntegrationStatus(userId, id, {
        automationCount: automationCounts?.[id] ?? 0,
      }),
    );
  }
  return rows;
}

export async function buildLiveIntegrationsDashboard(
  userId: string,
  automationCounts?: Partial<Record<LiveIntegrationServiceId, number>>,
): Promise<LiveIntegrationsDashboard> {
  const services = await listLiveIntegrationStatuses(userId, automationCounts);
  const connected = services.filter((s) => s.status === "connected");
  const needsReconnect = services.filter(
    (s) =>
      s.status === "needs_reconnect" ||
      s.status === "expired" ||
      s.status === "insufficient_scope",
  );
  const failed = services.filter(
    (s) => s.status === "error" || s.status === "needs_reconnect",
  );
  const lastUsed =
    [...services]
      .filter((s) => s.lastUsedAt)
      .sort((a, b) => (b.lastUsedAt ?? "").localeCompare(a.lastUsedAt ?? ""))[0] ??
    null;

  return {
    generatedAt: new Date().toISOString(),
    services,
    connectedCount: connected.length,
    needsAttentionCount: needsReconnect.length + failed.length,
    lastUsed,
    failed,
    needsReconnect,
  };
}
