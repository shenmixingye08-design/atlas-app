import { randomUUID } from "crypto";

import {
  getMaintenanceModeConfig,
  setMaintenanceModeConfig,
} from "@/lib/owner/system-status/maintenance";
import { buildMonitorHealth } from "@/lib/owner/monitoring/health";

import {
  clearDrFallback,
  listDrFallbacks,
  prependDrRecoveryEvent,
  setDrFallback,
} from "./store";
import type { DrFallbackMode, DrTargetId } from "./types";

export function activateFallback(input: {
  targetId: DrTargetId;
  mode?: DrFallbackMode;
  reason: string;
}): void {
  const mode = input.mode ?? "degraded";
  const now = new Date().toISOString();
  setDrFallback({
    targetId: input.targetId,
    mode,
    reason: input.reason.slice(0, 400),
    updatedAt: now,
  });
  prependDrRecoveryEvent({
    id: `dre_${randomUUID()}`,
    at: now,
    action: "fallback_on",
    targetId: input.targetId,
    message: `${mode}: ${input.reason}`.slice(0, 400),
    jobId: null,
  });
  void import("./durable").then((m) => m.schedulePersistDisasterRecovery());
}

export function deactivateFallback(targetId: DrTargetId): void {
  clearDrFallback(targetId);
  prependDrRecoveryEvent({
    id: `dre_${randomUUID()}`,
    at: new Date().toISOString(),
    action: "fallback_off",
    targetId,
    message: "Fallback cleared",
    jobId: null,
  });
}

/**
 * When multiple critical monitors are down, enable maintenance (reuse existing).
 */
export function maybeEnableMaintenanceFromHealth(now = new Date()): boolean {
  const health = buildMonitorHealth(now);
  const down = health.filter((row) => row.level === "down");
  const criticalDown = down.filter((row) =>
    ["openai", "stripe", "clerk", "cron"].includes(row.id),
  );

  if (criticalDown.length >= 2) {
    const current = getMaintenanceModeConfig();
    if (!current.enabled) {
      setMaintenanceModeConfig({
        enabled: true,
        message:
          "複数の重要サービスで障害を検知したため、一時的にメンテナンスモードへ切り替えました。",
        estimatedRecoveryAt: new Date(
          now.getTime() + 30 * 60 * 1000,
        ).toISOString(),
        announcement: criticalDown.map((row) => row.label).join(", "),
      });
      prependDrRecoveryEvent({
        id: `dre_${randomUUID()}`,
        at: now.toISOString(),
        action: "maintenance_on",
        targetId: "platform",
        message: `Auto maintenance: ${criticalDown.map((r) => r.id).join(",")}`,
        jobId: null,
      });
    }
    return true;
  }

  return false;
}

export function disableMaintenanceManually(): void {
  setMaintenanceModeConfig({ enabled: false });
  prependDrRecoveryEvent({
    id: `dre_${randomUUID()}`,
    at: new Date().toISOString(),
    action: "maintenance_off",
    targetId: "platform",
    message: "Maintenance disabled",
    jobId: null,
  });
}

export function isTargetInFallback(targetId: DrTargetId): boolean {
  const row = listDrFallbacks().find((f) => f.targetId === targetId);
  return Boolean(row && row.mode !== "none");
}

/**
 * Graceful degraded response for user-facing APIs when a dependency is offline.
 */
export function gracefulDegradedResponse(input: {
  targetId: DrTargetId;
  feature: string;
}): { status: number; body: { error: string; degraded: true; targetId: string } } {
  prependDrRecoveryEvent({
    id: `dre_${randomUUID()}`,
    at: new Date().toISOString(),
    action: "graceful_error",
    targetId: input.targetId,
    message: `${input.feature} degraded`,
    jobId: null,
  });
  return {
    status: 503,
    body: {
      error: `${input.feature} は一時的に利用できません。再試行キューに登録済みです。`,
      degraded: true,
      targetId: input.targetId,
    },
  };
}
