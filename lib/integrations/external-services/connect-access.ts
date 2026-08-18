import "server-only";

import {
  evaluateBillingExternalIntegration,
  evaluateBillingFeature,
  type BillingDenial,
} from "@/lib/billing/access/snapshot";

import { ensureExternalAuthHydrated } from "./durable";
import { listExternalServiceConnections } from "./store";
import type { ExternalServiceId } from "./types";

const RECONNECT_STATUSES = new Set(["connected", "error"]);

/**
 * Server-side gate for a new (or first) external connection.
 * Reconnect of an existing Google/X/WordPress/Dropbox account does not
 * consume another plan slot.
 */
export async function evaluateExternalServiceConnectAccess(
  userId: string,
  serviceId: ExternalServiceId,
): Promise<{ denial: BillingDenial | null }> {
  await ensureExternalAuthHydrated(userId);

  if (serviceId === "google") {
    const google = await evaluateBillingFeature(userId, "google_integration");
    if (google.denial) return { denial: google.denial };
  }

  const connections = listExternalServiceConnections(userId);
  const reconnectExempt = connections.some(
    (row) =>
      row.serviceId === serviceId && RECONNECT_STATUSES.has(row.status),
  );
  if (reconnectExempt) return { denial: null };

  const connectedCount = connections.filter(
    (row) => row.status === "connected",
  ).length;
  const slots = await evaluateBillingExternalIntegration(
    userId,
    connectedCount,
  );
  return { denial: slots.denial };
}
