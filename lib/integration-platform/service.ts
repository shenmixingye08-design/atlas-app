import "server-only";

import {
  catalogAudit,
  getConnection,
  listConnections,
  setConnectionStatus,
  upsertConnection,
} from "@/lib/integration-platform/connection-manager";
import {
  evaluateIntegrationCompletionGate,
  requiredServicesForAutomation,
} from "@/lib/integration-platform/completion-gate";
import { computeServiceMetrics, listIntegrationCalls } from "@/lib/integration-platform/metrics";
import { getAdapter, isIntegrationSandboxMode } from "@/lib/integration-platform/registry";
import { getTokenRecord } from "@/lib/integration-platform/token-store";
import type {
  CompletionGateResult,
  ExecuteResult,
  IntegrationServiceId,
} from "@/lib/integration-platform/types";
import { INTEGRATION_SERVICE_IDS } from "@/lib/integration-platform/types";

export async function getIntegrationDashboard(ownerId: string) {
  const connections = listConnections(ownerId);
  const catalog = catalogAudit();
  const metrics = INTEGRATION_SERVICE_IDS.map((serviceId) =>
    computeServiceMetrics(serviceId, {
      sandbox: isIntegrationSandboxMode() ? true : undefined,
    }),
  ).filter((m) => m.sampleSize > 0);

  const tokens = INTEGRATION_SERVICE_IDS.map((serviceId) => {
    const token = getTokenRecord(ownerId, serviceId);
    if (!token) return null;
    return {
      serviceId,
      expiresAt: token.expiresAt,
      failureCount: token.failureCount,
      lastUsedAt: token.lastUsedAt,
      rotationVersion: token.rotationVersion,
      hasRefresh: Boolean(token.refreshTokenEnc),
      scopes: token.scopes,
    };
  }).filter(Boolean);

  return {
    catalog,
    connections,
    metrics,
    tokens,
    recentCalls: listIntegrationCalls().slice(0, 50),
    sandboxMode: isIntegrationSandboxMode(),
  };
}

export async function ensureSandboxConnections(ownerId: string): Promise<void> {
  for (const serviceId of [
    "google_drive",
    "dropbox",
    "x",
    "wordpress",
  ] as IntegrationServiceId[]) {
    const adapter = getAdapter(serviceId);
    await adapter.connect(ownerId);
  }
}

export async function executeRequiredIntegrations(input: {
  ownerId: string;
  required: IntegrationServiceId[];
  artifactBuffer?: Buffer;
  fileName?: string;
  postText?: string;
}): Promise<ExecuteResult[]> {
  const results: ExecuteResult[] = [];
  for (const serviceId of input.required) {
    const adapter = getAdapter(serviceId);
    const connection = getConnection(input.ownerId, serviceId);
    if (!connection || connection.status !== "CONNECTED") {
      await adapter.connect(input.ownerId);
    }
    const action =
      serviceId === "x"
        ? "x_post"
        : serviceId === "wordpress"
          ? "wordpress_post"
          : "upload";
    const result = await adapter.execute({
      ownerId: input.ownerId,
      action,
      payload: {
        buffer: input.artifactBuffer,
        fileName: input.fileName ?? "deliverable.bin",
        content: input.postText,
        text: input.postText,
      },
      requireVerification: true,
    });
    results.push(result);
    setConnectionStatus(
      input.ownerId,
      serviceId,
      result.ok ? "CONNECTED" : "ERROR",
      result.errorMessage,
    );
  }
  return results;
}

export function gateAutomationCompletion(input: {
  artifactReady: boolean;
  templateId?: string | null;
  steps?: readonly string[] | null;
  uploadProvider?: IntegrationServiceId | null;
  requireUpload?: boolean;
  results: ExecuteResult[];
}): CompletionGateResult {
  const required = requiredServicesForAutomation({
    templateId: input.templateId,
    steps: input.steps,
    uploadProvider: input.uploadProvider,
    requireUpload: input.requireUpload,
  });
  return evaluateIntegrationCompletionGate({
    artifactReady: input.artifactReady,
    requiredServices: required,
    results: input.results,
  });
}

export async function refreshConnectionToken(
  ownerId: string,
  serviceId: IntegrationServiceId,
) {
  const adapter = getAdapter(serviceId);
  const token = await adapter.refreshToken(ownerId);
  if (!token) {
    setConnectionStatus(ownerId, serviceId, "ERROR", "refresh_failed");
    return null;
  }
  setConnectionStatus(ownerId, serviceId, "CONNECTED", "token_refreshed");
  return token;
}

export function seedDisconnectedCatalog(ownerId: string): void {
  for (const row of catalogAudit()) {
    if (getConnection(ownerId, row.serviceId)) continue;
    upsertConnection({
      ownerId,
      serviceId: row.serviceId,
      status: "DISCONNECTED",
      statusMessage: row.notes,
      scopes: [],
      lastValidatedAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      failureCount: 0,
      implementationClass: row.classification,
      metadata: {},
    });
  }
}
