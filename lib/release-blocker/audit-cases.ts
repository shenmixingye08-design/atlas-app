import { randomUUID } from "crypto";

import { recordAuditLog } from "@/lib/owner/audit-log/record";
import { sanitizeAuditReason } from "@/lib/owner/audit-log/sanitize";
import {
  listAuditLogEntries,
  resetAuditLogStoreForTests,
} from "@/lib/owner/audit-log/store";
import { resetAuditLogDurableForTests } from "@/lib/owner/audit-log/durable";

export type AuditCaseResult = {
  caseId: string;
  ok: boolean;
  detail: string;
};

/** Phase6 — who/when/what/success|failure/retry/IP/request_id/jobId/artifactId */
export async function runAuditCases(): Promise<AuditCaseResult[]> {
  resetAuditLogStoreForTests();
  resetAuditLogDurableForTests();

  const out: AuditCaseResult[] = [];
  const requestId = `req_${randomUUID().slice(0, 8)}`;
  const jobId = `oj_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
  const artifactId = `art_${randomUUID().slice(0, 8)}`;

  const success = await recordAuditLog({
    userId: "rb_audit_user",
    ip: "203.0.113.50",
    category: "request",
    action: "request_create",
    targetId: artifactId,
    result: "success",
    reason: "phase4 audit success",
    requestId,
    jobId,
    artifactId,
    retryCount: 0,
  });

  const failure = await recordAuditLog({
    userId: "rb_audit_user",
    ip: "203.0.113.50",
    category: "automation",
    action: "automation_run",
    targetId: jobId,
    result: "failure",
    reason: "timeout retry scheduled",
    requestId: `${requestId}_retry`,
    jobId,
    artifactId,
    retryCount: 2,
  });

  const rows = listAuditLogEntries();
  const hasWhoWhenWhat =
    Boolean(success.userId) &&
    Boolean(success.at) &&
    success.action === "request_create" &&
    failure.result === "failure";
  out.push({
    caseId: "rb_audit_who_when_what",
    ok: hasWhoWhenWhat,
    detail: `user=${success.userId} at=${success.at} action=${success.action}`,
  });

  out.push({
    caseId: "rb_audit_success_failure_retry",
    ok:
      success.result === "success" &&
      failure.result === "failure" &&
      failure.retryCount === 2,
    detail: `success=${success.result} failure=${failure.result} retry=${failure.retryCount}`,
  });

  out.push({
    caseId: "rb_audit_ip_request_job_artifact",
    ok:
      success.ip === "203.0.113.50" &&
      success.requestId === requestId &&
      success.jobId === jobId &&
      success.artifactId === artifactId &&
      rows.some((r) => r.requestId === `${requestId}_retry`),
    detail: `ip=${success.ip} requestId=${success.requestId} jobId=${success.jobId} artifactId=${success.artifactId}`,
  });

  const redacted = sanitizeAuditReason(
    'password=supersecret token=abc123 api_key="leak"'
  );
  out.push({
    caseId: "rb_audit_no_secrets",
    ok:
      Boolean(redacted) &&
      !/supersecret|abc123|leak/i.test(redacted ?? "") &&
      /REDACTED/i.test(redacted ?? ""),
    detail: `redacted=${redacted}`,
  });

  const poisoned = await recordAuditLog({
    userId: "rb_audit_user",
    category: "other",
    action: "owner_action",
    result: "failure",
    reason: "bearer=sk-live-should-not-persist",
    requestId: "req_secret_test",
  });
  out.push({
    caseId: "rb_audit_reason_redaction",
    ok: !/sk-live-should-not-persist/i.test(poisoned.reason ?? ""),
    detail: `reason=${poisoned.reason}`,
  });

  return out;
}
