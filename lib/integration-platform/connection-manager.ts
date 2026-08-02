import type {
  ConnectionRecord,
  ConnectionStatus,
  IntegrationImplementationClass,
  IntegrationServiceId,
} from "@/lib/integration-platform/types";
import { getTokenRecord } from "@/lib/integration-platform/token-store";

type Store = {
  connections: Map<string, ConnectionRecord>;
};

function getStore(): Store {
  const g = globalThis as typeof globalThis & {
    __atlasIntegrationConnectionStore?: Store;
  };
  if (!g.__atlasIntegrationConnectionStore) {
    g.__atlasIntegrationConnectionStore = { connections: new Map() };
  }
  return g.__atlasIntegrationConnectionStore;
}

function key(ownerId: string, serviceId: IntegrationServiceId): string {
  return `${ownerId}::${serviceId}`;
}

export function resetConnectionStoreForTests(): void {
  getStore().connections.clear();
}

export function upsertConnection(
  record: Omit<ConnectionRecord, "updatedAt"> & { updatedAt?: string },
): ConnectionRecord {
  const next: ConnectionRecord = {
    ...record,
    updatedAt: record.updatedAt ?? new Date().toISOString(),
  };
  getStore().connections.set(key(record.ownerId, record.serviceId), next);
  return structuredClone(next);
}

export function getConnection(
  ownerId: string,
  serviceId: IntegrationServiceId,
): ConnectionRecord | null {
  const found = getStore().connections.get(key(ownerId, serviceId));
  return found ? structuredClone(found) : null;
}

export function listConnections(ownerId: string): ConnectionRecord[] {
  return [...getStore().connections.values()]
    .filter((row) => row.ownerId === ownerId)
    .map((row) => structuredClone(row));
}

export function setConnectionStatus(
  ownerId: string,
  serviceId: IntegrationServiceId,
  status: ConnectionStatus,
  message?: string | null,
): ConnectionRecord {
  const existing = getConnection(ownerId, serviceId);
  return upsertConnection({
    ownerId,
    serviceId,
    status,
    statusMessage: message ?? existing?.statusMessage ?? null,
    scopes: existing?.scopes ?? [],
    lastValidatedAt: new Date().toISOString(),
    lastSuccessAt:
      status === "CONNECTED"
        ? new Date().toISOString()
        : existing?.lastSuccessAt ?? null,
    lastFailureAt:
      status === "ERROR" ||
      status === "EXPIRED" ||
      status === "REVOKED" ||
      status === "RATE_LIMIT"
        ? new Date().toISOString()
        : existing?.lastFailureAt ?? null,
    failureCount:
      status === "CONNECTED"
        ? 0
        : (existing?.failureCount ?? 0) + (status === "ERROR" ? 1 : 0),
    implementationClass: existing?.implementationClass ?? "partial",
    metadata: existing?.metadata ?? {},
  });
}

/** Derive status from token expiry / failures when adapter validate is unavailable. */
export function deriveStatusFromToken(
  ownerId: string,
  serviceId: IntegrationServiceId,
  fallback: ConnectionStatus = "DISCONNECTED",
): ConnectionStatus {
  const token = getTokenRecord(ownerId, serviceId);
  if (!token?.accessTokenEnc && !token?.refreshTokenEnc) return fallback;
  if (token.expiresAt && Date.parse(token.expiresAt) <= Date.now()) {
    return token.refreshTokenEnc ? "EXPIRED" : "EXPIRED";
  }
  if (token.failureCount >= 5) return "ERROR";
  return "CONNECTED";
}

export const SERVICE_CATALOG: Record<
  IntegrationServiceId,
  {
    label: string;
    implementationClass: IntegrationImplementationClass;
    notes: string;
  }
> = {
  google_drive: {
    label: "Google Drive",
    implementationClass: "live",
    notes: "OAuth + upload. Verification via metadata/download when requested.",
  },
  dropbox: {
    label: "Dropbox",
    implementationClass: "live",
    notes: "OAuth + upload/share. Not previously in deliverable auto-upload.",
  },
  x: {
    label: "X",
    implementationClass: "live",
    notes: "OAuth + tweet create + fetch-back verification.",
  },
  wordpress: {
    label: "WordPress",
    implementationClass: "live",
    notes: "Application Password + post ID/link verification.",
  },
  gmail: {
    label: "Gmail",
    implementationClass: "live",
    notes: "OAuth + send/draft with message id.",
  },
  outlook: {
    label: "Outlook",
    implementationClass: "unwired",
    notes: "coming_soon in connector catalog.",
  },
  google_calendar: {
    label: "Google Calendar",
    implementationClass: "live",
    notes: "OAuth + event create with htmlLink.",
  },
  slack: {
    label: "Slack",
    implementationClass: "partial",
    notes: "Registry/UI only — no live chat API.",
  },
  discord: {
    label: "Discord",
    implementationClass: "partial",
    notes: "Registry only — no live API client.",
  },
  notion: {
    label: "Notion",
    implementationClass: "mock",
    notes: "Stub connector marks connected without API.",
  },
  line: {
    label: "LINE",
    implementationClass: "live",
    notes: "Channel access token messaging.",
  },
  teams: {
    label: "Teams",
    implementationClass: "unwired",
    notes: "coming_soon.",
  },
  webhook: {
    label: "Webhook",
    implementationClass: "partial",
    notes: "Inbound webhooks exist; generic outbound not production.",
  },
  supabase_storage: {
    label: "Supabase Storage",
    implementationClass: "live",
    notes: "Backend artifact storage — not user OAuth integration.",
  },
  cloudflare_r2: {
    label: "Cloudflare R2",
    implementationClass: "unwired",
    notes: "No client/config.",
  },
  s3: {
    label: "S3",
    implementationClass: "unwired",
    notes: "Mentioned as future upload provider only.",
  },
};

export function catalogAudit(): Array<{
  serviceId: IntegrationServiceId;
  label: string;
  classification: IntegrationImplementationClass;
  notes: string;
}> {
  return (Object.keys(SERVICE_CATALOG) as IntegrationServiceId[]).map(
    (serviceId) => ({
      serviceId,
      label: SERVICE_CATALOG[serviceId].label,
      classification: SERVICE_CATALOG[serviceId].implementationClass,
      notes: SERVICE_CATALOG[serviceId].notes,
    }),
  );
}
