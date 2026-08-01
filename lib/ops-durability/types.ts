export type OpsFailureClass =
  | "job_creation_failed"
  | "queue_failed"
  | "worker_failed"
  | "stuck_job"
  | "invalid_state_transition"
  | "duplicate_job"
  | "duplicate_external_action"
  | "storage_upload_failed"
  | "storage_download_failed"
  | "signed_url_failed"
  | "notification_create_failed"
  | "push_failed"
  | "email_notification_failed"
  | "external_auth_expired"
  | "external_auth_revoked"
  | "external_permission_denied"
  | "external_rate_limit"
  | "external_timeout"
  | "external_4xx"
  | "external_5xx"
  | "token_refresh_failed"
  | "audit_log_failed"
  | "timeout"
  | "cancelled"
  | "needs_input"
  | "env_missing"
  | "not_connected"
  | "unknown";

export type OpsJobCategory =
  | "deliverable_generate"
  | "vision_analyze"
  | "convert"
  | "revision"
  | "notify_attached"
  | "external_action"
  | "retry_scenario"
  | "timeout_scenario"
  | "cancel_scenario"
  | "needs_input_scenario"
  | "idempotency_scenario";

export type OpsJobCase = {
  caseId: string;
  category: OpsJobCategory;
  title: string;
  uniqueToken: string;
};

export type OpsJobResult = {
  caseId: string;
  category: OpsJobCategory;
  ok: boolean;
  countedInSuccessRate: boolean;
  requestId: string;
  jobId: string | null;
  artifactId: string | null;
  diagnosticId: string | null;
  externalActionId: string | null;
  idempotencyKey: string;
  statusFinal: string | null;
  retryCount: number;
  failedStage: string | null;
  failureClass: OpsFailureClass | null;
  failureReason: string | null;
  durationMs: number;
  queueWaitMs: number | null;
  transitions: Array<{ from: string | null; to: string; at: string }>;
  environment: "local" | "production-http";
  log: string[];
};

export type OpsNotificationResult = {
  caseId: string;
  kind: string;
  okCreate: boolean;
  okPush: boolean;
  okEmail: boolean;
  duplicate: boolean;
  prematureComplete: boolean;
  delayMs: number | null;
  notificationId: string | null;
  requestId: string;
  failureClass: OpsFailureClass | null;
  failureReason: string | null;
  countedInSuccessRate: boolean;
};

export type OpsStorageResult = {
  caseId: string;
  format: string;
  okUpload: boolean;
  okDownload: boolean;
  okSignedUrl: boolean | null;
  zeroByte: boolean;
  mimeOk: boolean;
  extOk: boolean;
  crossUserLeak: boolean;
  orphan: boolean;
  fileSize: number;
  sha256: string | null;
  artifactId: string | null;
  requestId: string;
  failureClass: OpsFailureClass | null;
  durationMs: number;
};

export type OpsExternalResult = {
  caseId: string;
  service: "x" | "gmail" | "calendar" | "wordpress" | "dropbox";
  action: string;
  connected: boolean;
  ok: boolean;
  countedInSuccessRate: boolean;
  duplicatePrevented: boolean;
  tokenRefresh: "n/a" | "success" | "failed" | "revoked" | "skipped";
  externalActionId: string | null;
  requestId: string;
  durationMs: number;
  failureClass: OpsFailureClass | null;
  failureReason: string | null;
};

export type ConcurrentBatchResult = {
  concurrency: number;
  total: number;
  success: number;
  successRate: number;
  avgMs: number;
  p95Ms: number;
  p99Ms: number;
  timeoutRate: number;
  retryRate: number;
  stuckCount: number;
  memoryMb: number | null;
};

export type OpsDurabilityAggregate = {
  jobs: {
    total: number;
    counted: number;
    completed: number;
    failed: number;
    completedRate: number | null;
    failedRate: number | null;
    retryRate: number | null;
    retryThenSuccessRate: number | null;
    stuckRate: number | null;
    duplicateRate: number | null;
    avgMs: number | null;
    p90Ms: number | null;
    p95Ms: number | null;
    p99Ms: number | null;
    avgQueueWaitMs: number | null;
  };
  notifications: {
    total: number;
    createRate: number | null;
    pushRate: number | null;
    emailRate: number | null;
    avgDelayMs: number | null;
    p95DelayMs: number | null;
    duplicateRate: number | null;
    prematureCompleteCount: number;
  };
  storage: {
    total: number;
    uploadRate: number | null;
    downloadRate: number | null;
    signedUrlRate: number | null;
    zeroByteRate: number | null;
    orphanRate: number | null;
    permissionLeakCount: number;
  };
  external: {
    byService: Record<
      string,
      { total: number; counted: number; success: number; rate: number | null }
    >;
    duplicateActionCount: number;
    tokenRefreshSuccessRate: number | null;
  };
  concurrent: ConcurrentBatchResult[];
  failureRanking: Array<{ class: OpsFailureClass; count: number }>;
  phase3Pass: boolean;
  phase3FailReasons: string[];
  productionJobsPerCategory: number;
};
