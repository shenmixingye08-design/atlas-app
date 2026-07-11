import "server-only";

import { getOwnerEnvStatusSnapshot } from "@/lib/owner/env-status";
import { listErrorCategoryStates } from "@/lib/owner/error-monitoring/store";
import { getStripeWebhookMonitoringSnapshot } from "@/lib/owner/billing-webhook";
import { buildSystemStatusSnapshot } from "@/lib/owner/system-status/engine";
import { listAuditLogEntries } from "@/lib/owner/audit-log";
import { listOwnerNotifications } from "@/lib/notifications";

import { getMonitorTargetLabel, MONITOR_TARGET_IDS } from "./registry";
import { getCronTickState } from "./store";
import type {
  MonitorHealthLevel,
  MonitorTargetId,
  MonitorTargetSnapshot,
} from "./types";

function envServiceConfigured(
  service: "openai" | "clerk" | "stripe" | "supabase" | "google" | "dropbox" | "line" | "vercel_cron",
): { configured: number; total: number; requiredMissing: boolean } {
  const snapshot = getOwnerEnvStatusSnapshot();
  const rows = snapshot.variables.filter((row) => row.service === service);
  const configured = rows.filter((row) => row.configured).length;
  const requiredMissing = rows.some(
    (row) => row.requirement === "required" && !row.configured,
  );
  return { configured, total: rows.length, requiredMissing };
}

function hasOpenError(
  categoryIds: readonly string[],
): boolean {
  return listErrorCategoryStates().some(
    (state) =>
      categoryIds.includes(state.categoryId) &&
      state.resolutionStatus === "open" &&
      state.occurrenceCount > 0,
  );
}

function recentAuditFailures(
  actions: readonly string[],
  windowMs: number,
  now: Date,
): number {
  const cutoff = now.getTime() - windowMs;
  return listAuditLogEntries().filter((row) => {
    if (row.result !== "failure") return false;
    if (!actions.includes(row.action)) return false;
    return new Date(row.at).getTime() >= cutoff;
  }).length;
}

function mapSystemStatus(
  serviceId: "openai" | "stripe" | "google" | "dropbox",
): MonitorHealthLevel | null {
  const snap = buildSystemStatusSnapshot();
  const row = snap.services.find((s) => s.serviceId === serviceId);
  if (!row) return null;
  if (row.status === "outage") return "down";
  if (row.status === "maintenance") return "warn";
  if (row.uptimePercent < 98) return "warn";
  return "ok";
}

function hoursSince(iso: string | null, now: Date): number | null {
  if (!iso) return null;
  const ms = now.getTime() - new Date(iso).getTime();
  if (!Number.isFinite(ms)) return null;
  return ms / (1000 * 60 * 60);
}

export function buildMonitorHealth(
  now: Date = new Date(),
): MonitorTargetSnapshot[] {
  const hour = 60 * 60 * 1000;
  const cron = getCronTickState();
  const webhook = getStripeWebhookMonitoringSnapshot(now);

  const builders: Record<MonitorTargetId, () => MonitorTargetSnapshot> = {
    openai: () => {
      const env = envServiceConfigured("openai");
      let level: MonitorHealthLevel = "ok";
      let detail = "稼働中";
      if (env.requiredMissing) {
        level = "down";
        detail = "APIキー未設定";
      } else if (hasOpenError(["openai"])) {
        level = "down";
        detail = "未解決の OpenAI エラー";
      } else {
        const mapped = mapSystemStatus("openai");
        if (mapped === "down") {
          level = "down";
          detail = "障害検知";
        } else if (mapped === "warn") {
          level = "warn";
          detail = "稼働率低下";
        }
      }
      return {
        id: "openai",
        label: getMonitorTargetLabel("openai"),
        level,
        detail,
        lastCheckedAt: now.toISOString(),
      };
    },
    stripe: () => {
      const env = envServiceConfigured("stripe");
      let level: MonitorHealthLevel = "ok";
      let detail = "稼働中";
      if (env.requiredMissing) {
        level = "down";
        detail = "Stripe 未設定";
      } else if (hasOpenError(["stripe"])) {
        level = "down";
        detail = "未解決の Stripe エラー";
      } else if (webhook.failureCount > 0 && webhook.successRatePercent < 90) {
        level = "warn";
        detail = `Webhook 成功率 ${webhook.successRatePercent}%`;
      } else {
        const mapped = mapSystemStatus("stripe");
        if (mapped === "down") {
          level = "down";
          detail = "障害検知";
        } else if (mapped === "warn") {
          level = "warn";
          detail = "稼働率低下";
        }
      }
      return {
        id: "stripe",
        label: getMonitorTargetLabel("stripe"),
        level,
        detail,
        lastCheckedAt: webhook.lastSyncedAt ?? now.toISOString(),
      };
    },
    clerk: () => {
      const env = envServiceConfigured("clerk");
      const level: MonitorHealthLevel = env.requiredMissing ? "down" : "ok";
      return {
        id: "clerk",
        label: getMonitorTargetLabel("clerk"),
        level,
        detail: env.requiredMissing ? "Clerk 未設定" : "認証基盤 OK",
        lastCheckedAt: now.toISOString(),
      };
    },
    supabase: () => {
      const env = envServiceConfigured("supabase");
      let level: MonitorHealthLevel = "ok";
      let detail = "接続設定あり";
      if (env.total === 0) {
        level = "warn";
        detail = "定義なし";
      } else if (env.configured === 0) {
        level = "warn";
        detail = "未設定（メモリ運用）";
      } else if (env.configured < env.total) {
        level = "warn";
        detail = "一部未設定";
      }
      return {
        id: "supabase",
        label: getMonitorTargetLabel("supabase"),
        level,
        detail,
        lastCheckedAt: now.toISOString(),
      };
    },
    google: () => {
      const env = envServiceConfigured("google");
      let level: MonitorHealthLevel = "ok";
      let detail = "稼働中";
      if (env.configured === 0) {
        level = "warn";
        detail = "OAuth 未設定";
      } else if (hasOpenError(["google_auth"])) {
        level = "down";
        detail = "Google 認証エラー";
      } else {
        const mapped = mapSystemStatus("google");
        if (mapped === "down") level = "down";
        if (mapped === "warn") level = "warn";
      }
      return {
        id: "google",
        label: getMonitorTargetLabel("google"),
        level,
        detail,
        lastCheckedAt: now.toISOString(),
      };
    },
    dropbox: () => {
      const env = envServiceConfigured("dropbox");
      let level: MonitorHealthLevel = "ok";
      let detail = "稼働中";
      if (env.configured === 0) {
        level = "warn";
        detail = "OAuth 未設定";
      } else if (hasOpenError(["dropbox_auth"])) {
        level = "down";
        detail = "Dropbox 認証エラー";
      } else {
        const mapped = mapSystemStatus("dropbox");
        if (mapped === "down") level = "down";
        if (mapped === "warn") level = "warn";
      }
      return {
        id: "dropbox",
        label: getMonitorTargetLabel("dropbox"),
        level,
        detail,
        lastCheckedAt: now.toISOString(),
      };
    },
    line: () => {
      const env = envServiceConfigured("line");
      let level: MonitorHealthLevel = "ok";
      let detail = "Messaging API 設定あり";
      if (env.configured === 0) {
        level = "warn";
        detail = "LINE 未設定";
      }
      return {
        id: "line",
        label: getMonitorTargetLabel("line"),
        level,
        detail,
        lastCheckedAt: now.toISOString(),
      };
    },
    cron: () => {
      const env = envServiceConfigured("vercel_cron");
      const hoursOk = hoursSince(cron.lastSuccessAt, now);
      const hoursFail = hoursSince(cron.lastFailureAt, now);
      let level: MonitorHealthLevel = "ok";
      let detail = "直近の tick 成功";

      if (env.configured === 0) {
        level = "warn";
        detail = "CRON_SECRET 未設定";
      } else if (cron.lastFailureAt && (!cron.lastSuccessAt || (hoursFail ?? 99) < (hoursOk ?? 99))) {
        level = "down";
        detail = cron.lastError ?? "Cron tick 失敗";
      } else if (!cron.lastSuccessAt) {
        level = "warn";
        detail = "まだ tick 実績なし";
      } else if ((hoursOk ?? 0) > 2) {
        level = "down";
        detail = `最終成功から ${Math.round(hoursOk!)} 時間経過`;
      }

      return {
        id: "cron",
        label: getMonitorTargetLabel("cron"),
        level,
        detail,
        lastCheckedAt: cron.lastSuccessAt ?? cron.lastFailureAt,
      };
    },
    commander: () => {
      const fails = recentAuditFailures(["commander_run"], 6 * hour, now);
      let level: MonitorHealthLevel = "ok";
      let detail = "安定";
      if (fails >= 5) {
        level = "down";
        detail = `直近6時間で失敗 ${fails} 件`;
      } else if (fails >= 1) {
        level = "warn";
        detail = `直近6時間で失敗 ${fails} 件`;
      }
      return {
        id: "commander",
        label: getMonitorTargetLabel("commander"),
        level,
        detail,
        lastCheckedAt: now.toISOString(),
      };
    },
    automation: () => {
      const fails = recentAuditFailures(
        ["automation_run", "automation_create"],
        6 * hour,
        now,
      );
      let level: MonitorHealthLevel = "ok";
      let detail = "安定";
      if (fails >= 5) {
        level = "down";
        detail = `直近6時間で失敗 ${fails} 件`;
      } else if (fails >= 1) {
        level = "warn";
        detail = `直近6時間で失敗 ${fails} 件`;
      }
      return {
        id: "automation",
        label: getMonitorTargetLabel("automation"),
        level,
        detail,
        lastCheckedAt: now.toISOString(),
      };
    },
    notifications: () => {
      const ownerNotes = listOwnerNotifications();
      const recentErrors = ownerNotes.filter(
        (n) =>
          n.type === "error" &&
          now.getTime() - new Date(n.createdAt).getTime() < 6 * hour,
      ).length;
      let level: MonitorHealthLevel = "ok";
      let detail = `Owner通知 ${ownerNotes.length} 件`;
      if (recentErrors >= 10) {
        level = "warn";
        detail = `直近の障害通知が集中 (${recentErrors})`;
      }
      return {
        id: "notifications",
        label: getMonitorTargetLabel("notifications"),
        level,
        detail,
        lastCheckedAt: now.toISOString(),
      };
    },
    billing: () => {
      const env = envServiceConfigured("stripe");
      let level: MonitorHealthLevel = "ok";
      let detail = `Webhook 成功率 ${webhook.successRatePercent}%`;
      if (env.requiredMissing) {
        level = "down";
        detail = "Billing 未設定";
      } else if (webhook.failureCount > 3 && webhook.successRatePercent < 80) {
        level = "down";
        detail = "Webhook 障害多発";
      } else if (webhook.failureCount > 0) {
        level = "warn";
        detail = `失敗 ${webhook.failureCount} 件`;
      }
      return {
        id: "billing",
        label: getMonitorTargetLabel("billing"),
        level,
        detail,
        lastCheckedAt: webhook.lastSyncedAt ?? now.toISOString(),
      };
    },
  };

  return MONITOR_TARGET_IDS.map((id) => builders[id]());
}
