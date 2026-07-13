/** Configurable retention for owner audit logs. */
export type AuditRetentionDays = 30 | 90 | 365;

export const AUDIT_RETENTION_OPTIONS = [30, 90, 365] as const satisfies readonly AuditRetentionDays[];

export type AuditCategory =
  | "auth"
  | "billing"
  | "integration"
  | "automation"
  | "commander"
  | "request"
  | "data"
  | "account"
  | "owner"
  | "other";

export type AuditResult = "success" | "failure";

/** Canonical action names for known event types. */
export type AuditActionName =
  | "login"
  | "logout"
  | "plan_change"
  | "stripe_payment"
  | "stripe_cancel"
  | "google_connect"
  | "google_disconnect"
  | "dropbox_connect"
  | "dropbox_disconnect"
  | "x_connect"
  | "x_disconnect"
  | "line_connect"
  | "line_disconnect"
  | "automation_create"
  | "automation_update"
  | "automation_run"
  | "automation_disable"
  | "commander_run"
  | "request_create"
  | "request_delete"
  | "data_export"
  | "account_withdraw"
  | "account_cancel_deletion"
  | "account_purge"
  | "owner_action";

export type AuditLogEntry = {
  id: string;
  at: string;
  userId: string | null;
  email: string | null;
  ip: string | null;
  userAgent: string | null;
  category: AuditCategory;
  action: string;
  targetId: string | null;
  result: AuditResult;
  reason: string | null;
};

export type AuditLogSettings = {
  retentionDays: AuditRetentionDays;
  updatedAt: string | null;
};

export type AuditLogQuery = {
  q?: string;
  userId?: string;
  email?: string;
  category?: AuditCategory | "all";
  result?: AuditResult | "all";
  from?: string;
  to?: string;
  limit?: number;
};

export type AuditLogSnapshot = {
  entries: AuditLogEntry[];
  total: number;
  settings: AuditLogSettings;
  generatedAt: string;
};

export type RecordAuditLogInput = {
  userId?: string | null;
  email?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  category: AuditCategory;
  action: string;
  targetId?: string | null;
  result: AuditResult;
  reason?: string | null;
  at?: string;
};
