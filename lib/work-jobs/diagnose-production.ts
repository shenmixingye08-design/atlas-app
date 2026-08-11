import "server-only";

import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";
import { listDeveloperErrorLogsDurable } from "@/lib/reliability/developer-log";
import { loadWorkJobFromDurable } from "@/lib/work-jobs/durable";

function redact(text: unknown): string | null {
  if (text == null) return null;
  return String(text)
    .replace(/sk-[a-zA-Z0-9-_]+/g, "[redacted]")
    .replace(/sk_live_[A-Za-z0-9]+/g, "[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT]")
    .slice(0, 800);
}

function redactId(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  if (id.length <= 8) return "***";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

export type WorkJobDiagnoseResult = {
  ok: boolean;
  jobId: string;
  job: Record<string, unknown> | null;
  structuredLogs: Array<Record<string, unknown>>;
  reliabilityEvents: Array<Record<string, unknown>>;
  derived: {
    status: string | null;
    error: string | null;
    failedStage: string | null;
    developerCode: string | null;
    diagnosticId: string | null;
    failureClass: string | null;
    cause: string | null;
    step: string | null;
    createdAt: string | null;
    updatedAt: string | null;
    completedAt: string | null;
  };
  error: string | null;
};

export async function diagnoseWorkJobProduction(input: {
  jobId: string;
  userId?: string | null;
}): Promise<WorkJobDiagnoseResult> {
  const jobId = input.jobId.trim();
  const client = createServiceRoleClientIfConfigured();

  const structuredLogs = (
    await listDeveloperErrorLogsDurable({ jobId, limit: 20 })
  ).map((e) => ({
    id: e.id,
    at: e.at,
    correlationId: e.correlationId,
    diagnosticId: e.diagnosticId,
    failureClass: e.failureClass,
    message: redact(e.message),
    cause: redact(e.cause),
    step: e.step,
    attempt: e.attempt,
    maxAttempts: e.maxAttempts,
    apiStatus: e.apiStatus,
    apiResponseSummary: redact(e.apiResponseSummary),
    durationMs: e.durationMs,
    userIdRedacted: redactId(e.userId),
    jobId: e.jobId,
  }));

  let reliabilityEvents: Array<Record<string, unknown>> = [];
  if (client) {
    const { data, error } = await client
      .from("atlas_reliability_events")
      .select(
        "id,metric_key,outcome,error_code,error_message,message,stage,severity,diagnostic_id,job_id,user_id,duration_ms,created_at,metadata",
      )
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(20);
    if (!error && Array.isArray(data)) {
      reliabilityEvents = data.map((row) => ({
        id: row.id,
        metric_key: row.metric_key,
        outcome: row.outcome,
        error_code: row.error_code,
        error_message: redact(row.error_message),
        message: redact(row.message),
        stage: row.stage,
        severity: row.severity,
        diagnostic_id: row.diagnostic_id,
        duration_ms: row.duration_ms,
        created_at: row.created_at,
        userIdRedacted: redactId(
          typeof row.user_id === "string" ? row.user_id : null,
        ),
        metadata: row.metadata
          ? JSON.parse(redact(JSON.stringify(row.metadata)) || "{}")
          : null,
      }));
    }
  }

  const userIds: string[] = [];
  if (input.userId?.trim()) userIds.push(input.userId.trim());

  // Prefer explicit userId; else pull from structured log / reliability rows.
  // atlas_structured_logs may be ahead of generated Database types.
  if (client) {
    const loose = client as unknown as {
      from: (table: string) => {
        select: (cols: string) => {
          eq: (col: string, val: string) => {
            limit: (n: number) => Promise<{
              data: Array<Record<string, unknown>> | null;
            }>;
          };
        };
      };
    };
    const structured = await loose
      .from("atlas_structured_logs")
      .select("user_id")
      .eq("job_id", jobId)
      .limit(5);
    for (const row of structured.data || []) {
      if (typeof row.user_id === "string" && row.user_id) userIds.push(row.user_id);
    }
    const reliabilityUsers = await loose
      .from("atlas_reliability_events")
      .select("user_id")
      .eq("job_id", jobId)
      .limit(5);
    for (const row of reliabilityUsers.data || []) {
      if (typeof row.user_id === "string" && row.user_id) userIds.push(row.user_id);
    }
  }

  let job: Record<string, unknown> | null = null;
  for (const uid of [...new Set(userIds)]) {
    const record = await loadWorkJobFromDurable(jobId, uid);
    if (!record) continue;
    const meta =
      record.metadata && typeof record.metadata === "object"
        ? (record.metadata as Record<string, unknown>)
        : {};
    const fd =
      meta.failureDiagnostic && typeof meta.failureDiagnostic === "object"
        ? (meta.failureDiagnostic as Record<string, unknown>)
        : null;
    job = {
      id: record.id,
      userIdRedacted: redactId(record.userId),
      status: record.status,
      error: redact(record.error),
      attemptCount: record.attemptCount,
      maxAttempts: record.maxAttempts,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt,
      completedAt: record.completedAt,
      assignmentPreview:
        typeof record.assignment === "string"
          ? record.assignment.slice(0, 120)
          : null,
      visionGate: record.visionGate
        ? {
            analysisSuccess: record.visionGate.analysisSuccess ?? null,
            diagnosticId: record.visionGate.diagnosticId ?? null,
            failedStage: record.visionGate.failedStage ?? null,
            developerCode: record.visionGate.developerCode ?? null,
            message: redact(record.visionGate.message),
            cause: redact(record.visionGate.cause),
          }
        : null,
      failureDiagnostic: fd
        ? {
            diagnosticId: fd.diagnosticId ?? null,
            failedStage: fd.failedStage ?? null,
            developerCode: fd.developerCode ?? null,
            failureClass: fd.failureClass ?? null,
            cause: redact(fd.cause),
            safeMessage: redact(fd.safeMessage),
          }
        : null,
      resultPresent: Boolean(record.result),
      durablePersist: record.durablePersist ?? null,
    };
    break;
  }

  const firstLog = structuredLogs[0] ?? null;
  const firstRel = reliabilityEvents[0] ?? null;
  const fd = (job?.failureDiagnostic as Record<string, unknown> | null) ?? null;
  const vg = (job?.visionGate as Record<string, unknown> | null) ?? null;

  const derived = {
    status: (job?.status as string | null) ?? null,
    error: (job?.error as string | null) ?? null,
    failedStage:
      (fd?.failedStage as string | null) ??
      (vg?.failedStage as string | null) ??
      (firstRel?.stage as string | null) ??
      (firstLog?.step as string | null) ??
      null,
    developerCode:
      (fd?.developerCode as string | null) ??
      (vg?.developerCode as string | null) ??
      (firstRel?.error_code as string | null) ??
      (firstLog?.failureClass as string | null) ??
      null,
    diagnosticId:
      (fd?.diagnosticId as string | null) ??
      (vg?.diagnosticId as string | null) ??
      (firstRel?.diagnostic_id as string | null) ??
      (firstLog?.diagnosticId as string | null) ??
      null,
    failureClass: (firstLog?.failureClass as string | null) ?? null,
    cause:
      (fd?.cause as string | null) ??
      (firstLog?.cause as string | null) ??
      null,
    step: (firstLog?.step as string | null) ?? null,
    createdAt: (job?.createdAt as string | null) ?? null,
    updatedAt: (job?.updatedAt as string | null) ?? null,
    completedAt: (job?.completedAt as string | null) ?? null,
  };

  const ok = Boolean(job || structuredLogs.length || reliabilityEvents.length);
  return {
    ok,
    jobId,
    job,
    structuredLogs,
    reliabilityEvents,
    derived,
    error: ok
      ? null
      : client
        ? "job_not_found_in_structured_logs_or_user_state"
        : "service_role_not_configured",
  };
}
