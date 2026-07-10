import "server-only";

import {
  buildStripeWebhookMonitoringSnapshot,
  recordStripeWebhookLog,
} from "./telemetry";

export function getStripeWebhookMonitoringSnapshot(now?: Date) {
  return buildStripeWebhookMonitoringSnapshot(now);
}

export { recordStripeWebhookLog };
