/** Push notification severity for user filtering. */
export type PushSeverity = "critical" | "important" | "summary" | "info";

/** Event categories — controls default ON/OFF and user toggles. */
export type PushEventCategory =
  | "final_success"
  | "final_failure"
  | "approval_needed"
  | "connection_broken"
  | "daily_report"
  | "auto_recovered"
  | "job_start"
  | "internal_step"
  | "transient_error"
  | "mid_retry";

export type PushSubscriptionRecord = {
  id: string;
  userId: string;
  endpoint: string;
  p256dh: string;
  authKey: string;
  platform: string | null;
  browser: string | null;
  deviceName: string | null;
  failureCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PushDeviceStatus =
  | "unsupported"
  | "unregistered"
  | "default"
  | "granted"
  | "denied";

export type PushPreferences = {
  events: Record<PushEventCategory, boolean>;
  severities: Record<PushSeverity, boolean>;
  quietHoursStart: string | null;
  quietHoursEnd: string | null;
};

export const DEFAULT_PUSH_EVENTS: Record<PushEventCategory, boolean> = {
  final_success: true,
  final_failure: true,
  approval_needed: true,
  connection_broken: true,
  daily_report: true,
  auto_recovered: true,
  job_start: false,
  internal_step: false,
  transient_error: false,
  mid_retry: false,
};

export const DEFAULT_PUSH_SEVERITIES: Record<PushSeverity, boolean> = {
  critical: true,
  important: true,
  summary: true,
  info: false,
};

export const DEFAULT_PUSH_PREFERENCES: PushPreferences = {
  events: { ...DEFAULT_PUSH_EVENTS },
  severities: { ...DEFAULT_PUSH_SEVERITIES },
  quietHoursStart: null,
  quietHoursEnd: null,
};

export type PushPayload = {
  notificationId: string;
  title: string;
  body: string;
  targetUrl: string;
  severity: PushSeverity;
  eventCategory: PushEventCategory;
};
