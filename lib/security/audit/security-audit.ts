import { createHash, randomUUID } from "crypto";

import type { SecurityAuditRecord, SecurityDecision } from "../types";

const MAX_RECORDS = 10_000;

function store(): SecurityAuditRecord[] {
  const g = globalThis as typeof globalThis & {
    __atlasSecurityAudit?: SecurityAuditRecord[];
  };
  if (!g.__atlasSecurityAudit) g.__atlasSecurityAudit = [];
  return g.__atlasSecurityAudit;
}

export function createSecurityRequestId(): string {
  return `sreq_${randomUUID().replace(/-/g, "")}`;
}

export function createSecurityDiagnosticId(input: {
  resource: string;
  action: string;
  requestId: string;
}): string {
  return `sdiag_${createHash("sha256")
    .update(`${input.resource}:${input.action}:${input.requestId}`)
    .digest("hex")
    .slice(0, 16)}`;
}

export function recordSecurityAudit(
  input: Omit<SecurityAuditRecord, "when"> & { when?: string },
): SecurityAuditRecord {
  const record: SecurityAuditRecord = {
    ...input,
    when: input.when ?? new Date().toISOString(),
  };
  const rows = store();
  rows.push(record);
  if (rows.length > MAX_RECORDS) {
    rows.splice(0, rows.length - MAX_RECORDS);
  }
  return record;
}

export function listSecurityAuditRecords(filter?: {
  decision?: SecurityDecision;
  success?: boolean;
  limit?: number;
}): readonly SecurityAuditRecord[] {
  const limit = filter?.limit ?? 500;
  return store()
    .filter((row) => {
      if (filter?.decision && row.decision !== filter.decision) return false;
      if (filter?.success !== undefined && row.success !== filter.success) {
        return false;
      }
      return true;
    })
    .slice(-limit);
}

export function resetSecurityAuditForTests(): void {
  const g = globalThis as typeof globalThis & {
    __atlasSecurityAudit?: SecurityAuditRecord[];
  };
  g.__atlasSecurityAudit = [];
}

export function summarizeSecurityAudit(records: readonly SecurityAuditRecord[]): {
  total: number;
  success: number;
  failure: number;
  falseAllow: number;
  falseDeny: number;
} {
  const failure = records.filter((r) => !r.success).length;
  return {
    total: records.length,
    success: records.filter((r) => r.success).length,
    failure,
    // In durability harness, falseAllow/falseDeny are tagged via reason prefix.
    falseAllow: records.filter((r) => r.reason.startsWith("false_allow:")).length,
    falseDeny: records.filter((r) => r.reason.startsWith("false_deny:")).length,
  };
}
