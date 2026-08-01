import { createHash, randomUUID } from "crypto";

import type { IntegrationAuditRecord, IntegrationActionResult } from "./types";

const MAX_AUDIT_RECORDS = 5_000;

function auditStore(): IntegrationAuditRecord[] {
  const g = globalThis as typeof globalThis & {
    __atlasIntegrationAudit?: IntegrationAuditRecord[];
  };
  if (!g.__atlasIntegrationAudit) g.__atlasIntegrationAudit = [];
  return g.__atlasIntegrationAudit;
}

export function createIntegrationRequestId(): string {
  return `ireq_${randomUUID().replace(/-/g, "")}`;
}

export function createIntegrationDiagnosticId(input: {
  integration: string;
  action: string;
  requestId: string;
}): string {
  const digest = createHash("sha256")
    .update(`${input.integration}:${input.action}:${input.requestId}`)
    .digest("hex")
    .slice(0, 16);
  return `idiag_${digest}`;
}

export function recordIntegrationAudit(
  input: Omit<IntegrationAuditRecord, "createdAt"> & { createdAt?: string },
): IntegrationAuditRecord {
  const record: IntegrationAuditRecord = {
    ...input,
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
  const store = auditStore();
  store.push(record);
  if (store.length > MAX_AUDIT_RECORDS) {
    store.splice(0, store.length - MAX_AUDIT_RECORDS);
  }
  return record;
}

export function listIntegrationAuditRecords(filter?: {
  integration?: string;
  action?: string;
  result?: IntegrationActionResult;
  limit?: number;
}): readonly IntegrationAuditRecord[] {
  const limit = filter?.limit ?? 200;
  return auditStore()
    .filter((row) => {
      if (filter?.integration && row.integration !== filter.integration) {
        return false;
      }
      if (filter?.action && row.action !== filter.action) return false;
      if (filter?.result && row.result !== filter.result) return false;
      return true;
    })
    .slice(-limit);
}

export function resetIntegrationAuditForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasIntegrationAudit?: IntegrationAuditRecord[];
  };
  g.__atlasIntegrationAudit = [];
}

export function summarizeIntegrationAudit(records: readonly IntegrationAuditRecord[]): {
  total: number;
  success: number;
  duplicate: number;
  timeout: number;
  retryTotal: number;
  avgDurationMs: number;
  p95DurationMs: number;
} {
  const total = records.length;
  if (total === 0) {
    return {
      total: 0,
      success: 0,
      duplicate: 0,
      timeout: 0,
      retryTotal: 0,
      avgDurationMs: 0,
      p95DurationMs: 0,
    };
  }

  const durations = records.map((r) => r.durationMs).sort((a, b) => a - b);
  const p95Index = Math.min(
    durations.length - 1,
    Math.max(0, Math.ceil(durations.length * 0.95) - 1),
  );

  return {
    total,
    success: records.filter((r) => r.result === "success").length,
    duplicate: records.filter((r) => r.result === "duplicate").length,
    timeout: records.filter((r) => r.result === "timeout").length,
    retryTotal: records.reduce((sum, r) => sum + Math.max(0, r.retry), 0),
    avgDurationMs:
      records.reduce((sum, r) => sum + r.durationMs, 0) / Math.max(1, total),
    p95DurationMs: durations[p95Index] ?? 0,
  };
}
