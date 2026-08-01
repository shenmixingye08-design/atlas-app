import type { OpsFailureClass } from "@/lib/ops-durability/types";

export function classifyOpsFailure(input: {
  stage?: string | null;
  message?: string | null;
}): OpsFailureClass {
  const m = `${input.stage ?? ""} ${input.message ?? ""}`;
  if (/invalid_state_transition/i.test(m)) return "invalid_state_transition";
  if (/duplicate_job|idempotency.*hit/i.test(m)) return "duplicate_job";
  if (/duplicate_external|duplicate.*(post|mail|event)/i.test(m))
    return "duplicate_external_action";
  if (/stuck/i.test(m)) return "stuck_job";
  if (/queue/i.test(m)) return "queue_failed";
  if (/storage.*upload|upload.*fail/i.test(m)) return "storage_upload_failed";
  if (/storage.*download|download.*fail/i.test(m))
    return "storage_download_failed";
  if (/signed.?url/i.test(m)) return "signed_url_failed";
  if (/notification.*create|createNotification/i.test(m))
    return "notification_create_failed";
  if (/web_push|push_failed/i.test(m)) return "push_failed";
  if (/email_notification|mail.*fail/i.test(m))
    return "email_notification_failed";
  if (/revoked/i.test(m)) return "external_auth_revoked";
  if (/token_refresh/i.test(m)) return "token_refresh_failed";
  if (/expired|auth_expired|再接続/i.test(m)) return "external_auth_expired";
  if (/permission|forbidden|401|403/i.test(m))
    return "external_permission_denied";
  if (/429|rate.?limit/i.test(m)) return "external_rate_limit";
  if (/timeout|ETIMEDOUT/i.test(m)) return "timeout";
  if (/(?:^|\D)5\d\d(?:\D|$)/.test(m)) return "external_5xx";
  if (/(?:^|\D)4\d\d(?:\D|$)/.test(m)) return "external_4xx";
  if (/cancelled|user_cancelled/i.test(m)) return "cancelled";
  if (/needs_input|required_information/i.test(m)) return "needs_input";
  if (/not_connected|env_missing/i.test(m)) return "not_connected";
  if (/audit/i.test(m)) return "audit_log_failed";
  if (/worker|generation|convert|vision/i.test(m)) return "worker_failed";
  if (/job_creation|create.*job/i.test(m)) return "job_creation_failed";
  return "unknown";
}
