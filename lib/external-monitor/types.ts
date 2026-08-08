import type { AlertSeverity } from "./thresholds";

export type MonitorCheckId =
  | "scheduler.tick"
  | "automation.worker"
  | "automation.failed_runs"
  | "notification.retry"
  | "notification.dlq"
  | "side_effect.claims"
  | "database.core"
  | "external.openai";

export type FailureClass =
  | "internal"
  | "external_provider"
  | "mixed"
  | "unknown";

export type CheckStatus = "ok" | AlertSeverity;

export type MonitorCheckResult = {
  checkId: MonitorCheckId;
  status: CheckStatus;
  severity: CheckStatus;
  title: string;
  summary: string;
  metrics: Record<string, number | string | boolean | null>;
  failureClass: FailureClass;
  affectedUsersEstimate: number;
  synthetic: boolean;
  observedAt: string;
};

export type InjectionKind =
  | "tick_failure"
  | "worker_stale"
  | "dlq_spike"
  | "notification_failure"
  | "side_effect_failure";

export type AlertIncidentStatus = "open" | "acknowledged" | "resolved";

export type AlertDeliveryKind = "opened" | "continuation" | "resolved";

export type AlertDeliveryChannel = "line" | "system" | "probe";

export type AlertDeliveryStatus = "claimed" | "sent" | "failed" | "skipped";

export type AlertIncident = {
  id: string;
  fingerprint: string;
  checkId: MonitorCheckId;
  severity: AlertSeverity;
  status: AlertIncidentStatus;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  failureClass: FailureClass;
  affectedUsersEstimate: number;
  firstSeenAt: string;
  lastSeenAt: string;
  resolvedAt: string | null;
  lastNotifiedAt: string | null;
  notifyCount: number;
  continuationCount: number;
  claimOwner: string | null;
  claimUntil: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AlertDelivery = {
  id: string;
  incidentId: string;
  deliveryKind: AlertDeliveryKind;
  channel: AlertDeliveryChannel;
  status: AlertDeliveryStatus;
  dedupeKey: string;
  claimedBy: string;
  claimedAt: string;
  deliveredAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
};

export type MonitorInjection = {
  id: string;
  injectionKind: InjectionKind;
  active: boolean;
  expiresAt: string;
  createdBy: string | null;
  metadata: Record<string, unknown>;
  clearedAt: string | null;
  createdAt: string;
};

export type MonitorCycleResult = {
  ok: boolean;
  durableReady: boolean;
  memoryNotSot: boolean;
  instanceId: string;
  observedAt: string;
  checks: MonitorCheckResult[];
  openIncidents: number;
  resolvedThisCycle: number;
  deliveriesAttempted: number;
  deliveriesSent: number;
  deliveriesSkipped: number;
  error: string | null;
};

export const INJECTION_TO_CHECK: Record<InjectionKind, MonitorCheckId> = {
  tick_failure: "scheduler.tick",
  worker_stale: "automation.worker",
  dlq_spike: "notification.dlq",
  notification_failure: "notification.retry",
  side_effect_failure: "side_effect.claims",
};
