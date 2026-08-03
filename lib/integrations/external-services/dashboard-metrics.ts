/**
 * External adapter dashboard metrics (admin + end-user views).
 * Process-local snapshots — durable warehouse is out of scope for cutover.
 */

import { getDropboxLiveMetrics } from "@/lib/integrations/dropbox/live/metrics";
import { getWordPressAdapterMetrics } from "@/lib/integrations/wordpress/live/metrics";
import { getGoogleDriveLiveMetrics } from "@/lib/integrations/google/drive/live/metrics";
import { getGmailAdapterMetrics } from "@/lib/integrations/google/gmail/live/metrics";
import { getCalendarAdapterMetrics } from "@/lib/integrations/google/calendar/live/metrics";
import {
  EXTERNAL_AVAILABILITY_LABEL,
  EXTERNAL_PRODUCTION_REGISTRY,
  getExternalAvailability,
} from "@/lib/integrations/external-services/production-registry";
import { isLiveAdapterWired } from "@/lib/automation-platform/execution/production-step-registry";

export type AdminExternalServiceMetrics = {
  service: string;
  adapterMode: "production" | null;
  configured: boolean;
  connected: boolean | null;
  healthy: boolean | null;
  availabilityLabel: string;
  successRate: number | null;
  failureRate: number | null;
  averageLatencyMs: number | null;
  p95LatencyMs: number | null;
  retryRate: number | null;
  authFailureCount: number | null;
  duplicatePreventedCount: number | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
};

export type UserExternalServiceStatus = {
  service: string;
  availabilityLabel: string;
  connectionLabel:
    | "接続済み"
    | "再接続必要"
    | "権限不足"
    | "未接続"
    | "準備中"
    | "未対応";
  lastUsedAt: string | null;
  activeAutomationCount: number;
};

export function buildAdminExternalDashboardMetrics(input?: {
  connectedByService?: Record<string, boolean>;
  configuredByService?: Record<string, boolean>;
}): AdminExternalServiceMetrics[] {
  const drive = getGoogleDriveLiveMetrics();
  const gmail = getGmailAdapterMetrics();
  const calendar = getCalendarAdapterMetrics();
  const dropbox = getDropboxLiveMetrics();
  const wordpress = getWordPressAdapterMetrics();

  const byAdapter: Record<
    string,
    {
      successRate: number;
      failureRate: number;
      averageLatencyMs: number;
      p95LatencyMs: number;
      retryRate: number;
      authFailureCount: number;
      duplicatePreventedCount: number;
    }
  > = {
    google_drive: {
      successRate: drive.uploadSuccessRate,
      failureRate: drive.uploadFailureRate,
      averageLatencyMs: drive.averageLatencyMs,
      p95LatencyMs: drive.p95LatencyMs,
      retryRate: drive.retryRate,
      authFailureCount: drive.scopeErrorCount + drive.permissionErrorCount,
      duplicatePreventedCount: drive.duplicatePreventedCount,
    },
    google_gmail: {
      successRate: gmail.successRate,
      failureRate: gmail.failureRate,
      averageLatencyMs: gmail.averageLatencyMs,
      p95LatencyMs: gmail.p95LatencyMs,
      retryRate: gmail.retryRate,
      authFailureCount: gmail.scopeErrorCount,
      duplicatePreventedCount: gmail.duplicatePreventedCount,
    },
    google_calendar: {
      successRate: calendar.successRate,
      failureRate: calendar.failureRate,
      averageLatencyMs: calendar.averageLatencyMs,
      p95LatencyMs: calendar.p95LatencyMs,
      retryRate: calendar.retryRate,
      authFailureCount: calendar.scopeErrorCount,
      duplicatePreventedCount: calendar.duplicatePreventedCount,
    },
    dropbox: {
      successRate: dropbox.uploadSuccessRate,
      failureRate: dropbox.uploadFailureRate,
      averageLatencyMs: dropbox.averageLatencyMs,
      p95LatencyMs: dropbox.p95LatencyMs,
      retryRate: dropbox.retryRate,
      authFailureCount: dropbox.scopeErrorCount + dropbox.permissionErrorCount,
      duplicatePreventedCount: dropbox.duplicatePreventedCount,
    },
    wordpress: {
      successRate: wordpress.successRate,
      failureRate: wordpress.failureRate,
      averageLatencyMs: wordpress.averageLatencyMs,
      p95LatencyMs: wordpress.p95LatencyMs,
      retryRate: wordpress.retryRate,
      authFailureCount: 0,
      duplicatePreventedCount: wordpress.duplicatePreventedCount,
    },
  };

  return EXTERNAL_PRODUCTION_REGISTRY.map((entry) => {
    const snap = byAdapter[entry.adapterId];
    const wired = isLiveAdapterWired(entry.adapterId);
    return {
      service: entry.serviceLabel,
      adapterMode: entry.mode,
      configured:
        input?.configuredByService?.[entry.adapterId] ??
        (entry.availability === "available" ? wired : false),
      connected: input?.connectedByService?.[entry.adapterId] ?? null,
      healthy:
        entry.availability === "available"
          ? wired && (snap ? snap.failureRate === 0 || snap.successRate > 0 : true)
          : null,
      availabilityLabel: EXTERNAL_AVAILABILITY_LABEL[entry.availability],
      successRate: snap?.successRate ?? null,
      failureRate: snap?.failureRate ?? null,
      averageLatencyMs: snap?.averageLatencyMs ?? null,
      p95LatencyMs: snap?.p95LatencyMs ?? null,
      retryRate: snap?.retryRate ?? null,
      authFailureCount: snap?.authFailureCount ?? null,
      duplicatePreventedCount: snap?.duplicatePreventedCount ?? null,
      lastSuccessAt: null,
      lastFailureAt: null,
    };
  });
}

export function buildUserExternalServiceStatuses(input: {
  connectionByService: Record<
    string,
    "connected" | "reconnect_required" | "missing_scope" | "disconnected"
  >;
  lastUsedByService?: Record<string, string | null>;
  activeAutomationCountByService?: Record<string, number>;
}): UserExternalServiceStatus[] {
  return EXTERNAL_PRODUCTION_REGISTRY.map((entry) => {
    const availability = getExternalAvailability(entry.adapterId);
    if (availability === "preparing" || availability === "unsupported") {
      return {
        service: entry.serviceLabel,
        availabilityLabel: EXTERNAL_AVAILABILITY_LABEL[availability],
        connectionLabel: availability === "preparing" ? "準備中" : "未対応",
        lastUsedAt: null,
        activeAutomationCount: 0,
      };
    }
    const connection =
      input.connectionByService[entry.adapterId] ?? "disconnected";
    const connectionLabel =
      connection === "connected"
        ? "接続済み"
        : connection === "reconnect_required"
          ? "再接続必要"
          : connection === "missing_scope"
            ? "権限不足"
            : "未接続";
    return {
      service: entry.serviceLabel,
      availabilityLabel: EXTERNAL_AVAILABILITY_LABEL[availability],
      connectionLabel,
      lastUsedAt: input.lastUsedByService?.[entry.adapterId] ?? null,
      activeAutomationCount:
        input.activeAutomationCountByService?.[entry.adapterId] ?? 0,
    };
  });
}

export function buildAggregateExternalStepMetrics(): {
  externalStepSuccessRate: number | null;
  externalStepFailureRate: number | null;
  providerAuthFailureRate: number | null;
  completionEvidenceFailureRate: number | null;
} {
  const rows = buildAdminExternalDashboardMetrics().filter(
    (row) => row.adapterMode === "production",
  );
  let successSum = 0;
  let failureSum = 0;
  let counted = 0;
  let authFailures = 0;
  for (const row of rows) {
    if (row.successRate == null || row.failureRate == null) continue;
    successSum += row.successRate;
    failureSum += row.failureRate;
    counted += 1;
    authFailures += row.authFailureCount ?? 0;
  }
  if (counted === 0) {
    return {
      externalStepSuccessRate: null,
      externalStepFailureRate: null,
      providerAuthFailureRate: null,
      completionEvidenceFailureRate: null,
    };
  }
  return {
    externalStepSuccessRate: successSum / counted,
    externalStepFailureRate: failureSum / counted,
    providerAuthFailureRate: authFailures,
    completionEvidenceFailureRate: null,
  };
}
