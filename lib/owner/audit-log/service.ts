import "server-only";

import {
  ensureAuditLogHydrated,
  persistAuditLogNow,
  schedulePersistAuditLog,
} from "./durable";
import {
  getAuditLogSettings,
  listAuditLogEntries,
  pruneAuditLogEntries,
  setAuditLogSettings,
} from "./store";
import type {
  AuditLogEntry,
  AuditLogQuery,
  AuditLogSettings,
  AuditLogSnapshot,
  AuditRetentionDays,
} from "./types";
import { AUDIT_RETENTION_OPTIONS } from "./types";

function escapeCsv(value: unknown): string {
  const text =
    value === null || value === undefined
      ? ""
      : typeof value === "string"
        ? value
        : JSON.stringify(value);
  if (/[",\n\r]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function retentionCutoffIso(settings: AuditLogSettings, now = new Date()): string {
  const cutoff = new Date(now);
  cutoff.setUTCDate(cutoff.getUTCDate() - settings.retentionDays);
  return cutoff.toISOString();
}

export function isAuditRetentionDays(value: unknown): value is AuditRetentionDays {
  return (
    typeof value === "number" &&
    (AUDIT_RETENTION_OPTIONS as readonly number[]).includes(value)
  );
}

export function filterAuditLogEntries(
  entries: AuditLogEntry[],
  query: AuditLogQuery = {},
): AuditLogEntry[] {
  const q = query.q?.trim().toLowerCase() ?? "";
  const userId = query.userId?.trim() ?? "";
  const email = query.email?.trim().toLowerCase() ?? "";
  const category = query.category && query.category !== "all" ? query.category : null;
  const result = query.result && query.result !== "all" ? query.result : null;
  const fromMs = query.from ? new Date(query.from).getTime() : null;
  const toMs = query.to ? new Date(query.to).getTime() : null;

  return entries.filter((row) => {
    if (userId && row.userId !== userId) return false;
    if (email && !(row.email ?? "").toLowerCase().includes(email)) return false;
    if (category && row.category !== category) return false;
    if (result && row.result !== result) return false;

    const at = new Date(row.at).getTime();
    if (fromMs != null && Number.isFinite(fromMs) && at < fromMs) return false;
    if (toMs != null && Number.isFinite(toMs) && at > toMs) return false;

    if (q) {
      const hay = [
        row.userId,
        row.email,
        row.action,
        row.category,
        row.targetId,
        row.reason,
        row.ip,
        row.result,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      if (!hay.includes(q)) return false;
    }

    return true;
  });
}

export async function listOwnerAuditLogs(
  query: AuditLogQuery = {},
): Promise<AuditLogSnapshot> {
  await ensureAuditLogHydrated();
  const settings = getAuditLogSettings();
  pruneAuditLogEntries(retentionCutoffIso(settings));

  const filtered = filterAuditLogEntries(listAuditLogEntries(), query);
  const limit =
    typeof query.limit === "number" && query.limit > 0
      ? Math.min(query.limit, 2000)
      : 500;

  return {
    entries: filtered.slice(0, limit),
    total: filtered.length,
    settings,
    generatedAt: new Date().toISOString(),
  };
}

export function auditLogsToCsv(entries: AuditLogEntry[]): string {
  const headers = [
    "at",
    "userId",
    "email",
    "ip",
    "userAgent",
    "category",
    "action",
    "targetId",
    "result",
    "reason",
  ];
  const rows = entries.map((row) => [
    row.at,
    row.userId,
    row.email,
    row.ip,
    row.userAgent,
    row.category,
    row.action,
    row.targetId,
    row.result,
    row.reason,
  ]);
  const lines = [
    headers.map(escapeCsv).join(","),
    ...rows.map((row) => row.map(escapeCsv).join(",")),
  ];
  return `${lines.join("\n")}\n`;
}

export async function updateAuditRetention(
  retentionDays: AuditRetentionDays,
): Promise<AuditLogSettings> {
  await ensureAuditLogHydrated();
  const settings = setAuditLogSettings(retentionDays);
  pruneAuditLogEntries(retentionCutoffIso(settings));
  await persistAuditLogNow();
  return settings;
}

export async function pruneExpiredAuditLogs(): Promise<{ pruned: number }> {
  await ensureAuditLogHydrated();
  const pruned = pruneAuditLogEntries(retentionCutoffIso(getAuditLogSettings()));
  if (pruned > 0) {
    schedulePersistAuditLog();
  }
  return { pruned };
}

export function parseAuditLogQuery(
  searchParams: URLSearchParams,
): AuditLogQuery {
  const category = searchParams.get("category");
  const result = searchParams.get("result");
  const limitRaw = searchParams.get("limit");
  const limit = limitRaw ? Number(limitRaw) : undefined;

  return {
    ...(searchParams.get("q") ? { q: searchParams.get("q")! } : {}),
    ...(searchParams.get("userId")
      ? { userId: searchParams.get("userId")! }
      : {}),
    ...(searchParams.get("email") ? { email: searchParams.get("email")! } : {}),
    ...(category
      ? {
          category: category as AuditLogQuery["category"],
        }
      : {}),
    ...(result
      ? {
          result: result as AuditLogQuery["result"],
        }
      : {}),
    ...(searchParams.get("from") ? { from: searchParams.get("from")! } : {}),
    ...(searchParams.get("to") ? { to: searchParams.get("to")! } : {}),
    ...(typeof limit === "number" && Number.isFinite(limit)
      ? { limit }
      : {}),
  };
}
