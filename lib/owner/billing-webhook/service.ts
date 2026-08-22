import "server-only";

import {
  buildStripeWebhookMonitoringSnapshot,
  ensureWebhookTelemetryHydrated,
  recordStripeWebhookLog,
} from "./telemetry";

/** In-memory snapshot. Prefer getHydratedStripeWebhookMonitoringSnapshot for Owner UI. */
export function getStripeWebhookMonitoringSnapshot(now?: Date) {
  return buildStripeWebhookMonitoringSnapshot(now);
}

export async function getHydratedStripeWebhookMonitoringSnapshot(now?: Date) {
  const durableReady = await ensureWebhookTelemetryHydrated();
  return buildStripeWebhookMonitoringSnapshot(now, { durableReady });
}

export { recordStripeWebhookLog };
