import "server-only";

import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { externalServiceManager } from "@/lib/integrations/external-services/service";
import type { ExternalServiceConnectResult } from "@/lib/integrations/external-services/types";
import {
  recordDropboxIntegrationUsage,
  recordGoogleIntegrationUsage,
} from "@/lib/owner/popularity-ranking/telemetry";

import { buildOwnerExternalServicesSnapshot } from "./engine";
import { isOwnerExternalServiceId } from "./registry";
import type {
  OwnerExternalServiceId,
  OwnerExternalServicesSnapshot,
} from "./types";

export function getOwnerExternalServicesSnapshot(
  now?: Date,
): OwnerExternalServicesSnapshot {
  return buildOwnerExternalServicesSnapshot(now);
}

export type OwnerExternalServiceReconnectResult = {
  snapshot: OwnerExternalServicesSnapshot;
  authorizeUrl?: string;
  message: string;
};

function resolveReconnectTarget(
  serviceId: OwnerExternalServiceId,
): "google" | "dropbox" | null {
  if (
    serviceId === "google" ||
    serviceId === "gmail" ||
    serviceId === "calendar" ||
    serviceId === "drive"
  ) {
    return "google";
  }
  if (serviceId === "dropbox") return "dropbox";
  return null;
}

export function parseOwnerExternalServiceReconnectBody(body: unknown):
  | { serviceId: OwnerExternalServiceId }
  | { error: string } {
  if (!body || typeof body !== "object") {
    return { error: "Request body must be an object" };
  }

  const record = body as { serviceId?: unknown; action?: unknown };
  if (record.action !== undefined && record.action !== "reconnect") {
    return { error: "action must be reconnect" };
  }

  if (
    typeof record.serviceId !== "string" ||
    !isOwnerExternalServiceId(record.serviceId)
  ) {
    return { error: "serviceId is invalid" };
  }

  if (!resolveReconnectTarget(record.serviceId)) {
    return { error: "This service does not support reconnect from owner panel" };
  }

  return { serviceId: record.serviceId };
}

export async function reconnectOwnerExternalService(input: {
  serviceId: OwnerExternalServiceId;
  requestOrigin: string;
}): Promise<OwnerExternalServiceReconnectResult> {
  const target = resolveReconnectTarget(input.serviceId);
  if (!target) {
    throw new Error("This service does not support reconnect from owner panel");
  }

  const { userId } = await auth();
  if (!userId) {
    throw new Error("Unauthorized");
  }

  const accessContext = await resolveFeatureAccessContext();
  const current = externalServiceManager.getConnection(userId, target);

  if (current.status === "connected") {
    await externalServiceManager.disconnect(userId, target);
  }

  const result: ExternalServiceConnectResult =
    await externalServiceManager.connect(
      userId,
      target,
      input.requestOrigin,
      accessContext,
    );

  if (result.connection.status === "connected") {
    if (target === "google") recordGoogleIntegrationUsage();
    if (target === "dropbox") recordDropboxIntegrationUsage();
  }

  return {
    snapshot: getOwnerExternalServicesSnapshot(),
    authorizeUrl: result.authorizeUrl,
    message: result.message,
  };
}
