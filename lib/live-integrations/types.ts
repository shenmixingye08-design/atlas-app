/**
 * Unified Live Integration status — maps fragmented provider checks
 * into one vocabulary for Connection Center / Preflight / Dashboard.
 *
 * Never stores tokens here.
 */

export type LiveIntegrationServiceId =
  | "gmail"
  | "google_calendar"
  | "dropbox"
  | "wordpress"
  | "x";

export type LiveConnectionStatus =
  | "connected"
  | "not_connected"
  | "expired"
  | "insufficient_scope"
  | "needs_reconnect"
  | "feature_disabled"
  | "error";

export type LiveIntegrationStatus = {
  serviceId: LiveIntegrationServiceId;
  label: string;
  status: LiveConnectionStatus;
  /** Human message — never includes tokens */
  message: string;
  reconnectHref: string | null;
  connectHref: string | null;
  lastUsedAt: string | null;
  /** Automations currently referencing this connector */
  automationCount: number;
  scopesGranted: string[];
  scopesMissing: string[];
  checkedAt: string;
};

export type PreflightIssue = {
  serviceId: LiveIntegrationServiceId | "unknown";
  code:
    | "not_connected"
    | "expired"
    | "insufficient_scope"
    | "needs_reconnect"
    | "feature_disabled"
    | "missing_config"
    | "duplicate_risk";
  severity: "block" | "warn";
  title: string;
  description: string;
  actionLabel: string | null;
  actionHref: string | null;
};

export type PreflightResult = {
  ok: boolean;
  issues: PreflightIssue[];
  checkedAt: string;
};

export type LiveAdapterResult = {
  ok: boolean;
  summary: string;
  externalId: string | null;
  url: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  needsReconnect: boolean;
  retryable: boolean;
  /** Duplicate prevented */
  skippedDuplicate: boolean;
};

export type LiveIntegrationsDashboard = {
  generatedAt: string;
  services: LiveIntegrationStatus[];
  connectedCount: number;
  needsAttentionCount: number;
  lastUsed: LiveIntegrationStatus | null;
  failed: LiveIntegrationStatus[];
  needsReconnect: LiveIntegrationStatus[];
};

export const LIVE_SERVICE_LABELS: Record<LiveIntegrationServiceId, string> = {
  gmail: "Gmail",
  google_calendar: "Google Calendar",
  dropbox: "Dropbox",
  wordpress: "WordPress",
  x: "X",
};

export const LIVE_CONNECT_HREFS: Record<LiveIntegrationServiceId, string> = {
  gmail: "/settings/google/gmail",
  google_calendar: "/settings/google/calendar",
  dropbox: "/settings",
  wordpress: "/settings/wordpress",
  x: "/settings/x",
};

export const LIVE_OAUTH_AUTHORIZE: Partial<
  Record<LiveIntegrationServiceId, string>
> = {
  gmail: "/api/external-services/google/oauth/authorize",
  google_calendar: "/api/external-services/google/oauth/authorize",
  dropbox: "/api/external-services/dropbox/oauth/authorize",
  x: "/api/external-services/x/oauth/authorize",
};
