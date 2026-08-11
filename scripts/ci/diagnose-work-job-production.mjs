#!/usr/bin/env node
/**
 * Production work-job diagnostic (redacted).
 * Fetches atlas_user_state job + atlas_reliability_events by jobId.
 * Secrets never logged.
 *
 * Env:
 *   DIAGNOSE_JOB_ID (required)
 *   E2E_CLERK_USER_ID (optional, preferred user for atlasWorkJobs lookup)
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   OR DATABASE_URL / POSTGRES_URL (psql JSON query)
 *   DIAGNOSE_OUT (output dir)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const JOB_ID = process.env.DIAGNOSE_JOB_ID?.trim() || "";
const USER_A = process.env.E2E_CLERK_USER_ID?.trim() || "";
const OUT =
  process.env.DIAGNOSE_OUT?.trim() ||
  join(process.cwd(), "tmp", "diagnose-work-job");
const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() ||
  process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() ||
  "";
const SERVICE =
  process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
  process.env.SUPABASE_SERVICE_KEY?.trim() ||
  "";
const PG =
  process.env.POSTGRES_URL_NON_POOLING?.trim() ||
  process.env.POSTGRES_URL?.trim() ||
  process.env.DATABASE_URL?.trim() ||
  process.env.SUPABASE_DB_URL?.trim() ||
  "";

function redact(value) {
  const s = String(value ?? "");
  return s
    .replace(/sk_live_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/sk_test_[A-Za-z0-9]+/g, "[REDACTED]")
    .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, "[JWT]")
    .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[PG_URL]")
    .slice(0, 2000);
}

function redactId(id) {
  if (!id || typeof id !== "string") return null;
  if (id.length <= 8) return "***";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function slimJob(job) {
  if (!job || typeof job !== "object") return null;
  const meta = job.metadata && typeof job.metadata === "object" ? job.metadata : {};
  const fd =
    meta.failureDiagnostic && typeof meta.failureDiagnostic === "object"
      ? meta.failureDiagnostic
      : null;
  return {
    id: job.id ?? null,
    userIdRedacted: redactId(job.userId),
    status: job.status ?? null,
    error: job.error ? redact(job.error).slice(0, 500) : null,
    attemptCount: job.attemptCount ?? null,
    maxAttempts: job.maxAttempts ?? null,
    createdAt: job.createdAt ?? null,
    updatedAt: job.updatedAt ?? null,
    completedAt: job.completedAt ?? null,
    assignmentPreview: typeof job.assignment === "string"
      ? job.assignment.slice(0, 120)
      : null,
    visionGate: job.visionGate
      ? {
          analysisSuccess: job.visionGate.analysisSuccess ?? null,
          message: job.visionGate.message
            ? redact(job.visionGate.message).slice(0, 300)
            : null,
          diagnosticId: job.visionGate.diagnosticId ?? null,
          failedStage: job.visionGate.failedStage ?? null,
          failedStageLabel: job.visionGate.failedStageLabel ?? null,
          developerCode: job.visionGate.developerCode ?? null,
          cause: job.visionGate.cause
            ? redact(job.visionGate.cause).slice(0, 300)
            : null,
          openai: job.visionGate.openai
            ? {
                httpStatus: job.visionGate.openai.httpStatus ?? null,
                type: job.visionGate.openai.type ?? null,
                code: job.visionGate.openai.code ?? null,
                message: job.visionGate.openai.message
                  ? redact(job.visionGate.openai.message).slice(0, 300)
                  : null,
                requestId: job.visionGate.openai.requestId ?? null,
              }
            : null,
          vercelRequestId: job.visionGate.vercelRequestId ?? null,
        }
      : null,
    failureDiagnostic: fd
      ? {
          jobId: fd.jobId ?? null,
          diagnosticId: fd.diagnosticId ?? null,
          failedStage: fd.failedStage ?? null,
          developerCode: fd.developerCode ?? null,
          cause: fd.cause ? redact(fd.cause).slice(0, 300) : null,
          safeMessage: fd.safeMessage
            ? redact(fd.safeMessage).slice(0, 300)
            : null,
          vercelRequestId: fd.vercelRequestId ?? null,
          openai: fd.openai
            ? {
                httpStatus: fd.openai.httpStatus ?? null,
                type: fd.openai.type ?? null,
                code: fd.openai.code ?? null,
                message: fd.openai.message
                  ? redact(fd.openai.message).slice(0, 300)
                  : null,
                requestId: fd.openai.requestId ?? null,
              }
            : null,
        }
      : null,
    resultPresent: Boolean(job.result),
    resultStatus: job.result?.status ?? null,
    fileCount: Array.isArray(job.result?.fileDeliverables)
      ? job.result.fileDeliverables.length
      : Array.isArray(job.result?.files)
        ? job.result.files.length
        : null,
  };
}

function slimEvent(row) {
  return {
    id: row.id ?? null,
    metric_key: row.metric_key ?? null,
    outcome: row.outcome ?? null,
    error_code: row.error_code ?? null,
    error_message: row.error_message
      ? redact(row.error_message).slice(0, 400)
      : null,
    message: row.message ? redact(row.message).slice(0, 400) : null,
    stage: row.stage ?? null,
    severity: row.severity ?? null,
    diagnostic_id: row.diagnostic_id ?? null,
    job_id: row.job_id ?? null,
    user_id_redacted: redactId(row.user_id),
    duration_ms: row.duration_ms ?? null,
    created_at: row.created_at ?? null,
    metadata: row.metadata
      ? JSON.parse(redact(JSON.stringify(row.metadata)).slice(0, 1500) || "{}")
      : null,
  };
}

async function viaSupabase() {
  if (!SUPABASE_URL || !SERVICE) return null;
  const client = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const out = {
    source: "supabase_service_role",
    job: null,
    reliabilityEvents: [],
    userStateFound: false,
  };

  // Reliability events by job_id (global index)
  const { data: events, error: evErr } = await client
    .from("atlas_reliability_events")
    .select(
      "id,metric_key,outcome,error_code,error_message,message,stage,severity,diagnostic_id,job_id,user_id,duration_ms,created_at,metadata",
    )
    .eq("job_id", JOB_ID)
    .order("created_at", { ascending: false })
    .limit(20);
  if (evErr) {
    out.reliabilityError = redact(evErr.message);
  } else {
    out.reliabilityEvents = (events || []).map(slimEvent);
  }

  // Prefer E2E user A, then any user_id from reliability events.
  const rawUserIds = [
    USER_A,
    ...((events || []).map((e) => e.user_id).filter((u) => typeof u === "string")),
  ].filter(Boolean);
  const uniqueUsers = [...new Set(rawUserIds)];

  for (const uid of uniqueUsers) {
    const { data, error } = await client
      .from("atlas_user_state")
      .select("user_id,domain,payload,updated_at")
      .eq("user_id", uid)
      .eq("domain", "atlasWorkJobs")
      .maybeSingle();
    if (error) {
      out.userStateError = redact(error.message);
      continue;
    }
    if (!data) continue;
    out.userStateFound = true;
    const envelope = data.payload;
    const jobs =
      envelope?.payload?.jobs ||
      envelope?.jobs ||
      (Array.isArray(envelope) ? envelope : null);
    const list = Array.isArray(jobs) ? jobs : [];
    const hit = list.find((j) => j && j.id === JOB_ID);
    if (hit) {
      out.job = slimJob(hit);
      out.userStateUpdatedAt = data.updated_at ?? null;
      break;
    }
  }

  return out;
}

function viaPostgres() {
  if (!PG) return null;
  const sql = `
SELECT json_build_object(
  'reliability', (
    SELECT coalesce(json_agg(t ORDER BY t.created_at DESC), '[]'::json)
    FROM (
      SELECT id, metric_key, outcome, error_code, error_message, message, stage,
             severity, diagnostic_id, job_id, user_id, duration_ms, created_at, metadata
      FROM public.atlas_reliability_events
      WHERE job_id = '${JOB_ID.replace(/'/g, "''")}'
      ORDER BY created_at DESC
      LIMIT 20
    ) t
  ),
  'user_state_rows', (
    SELECT coalesce(json_agg(r), '[]'::json)
    FROM (
      SELECT user_id, domain, updated_at,
             (payload::text) AS payload_text
      FROM public.atlas_user_state
      WHERE domain = 'atlasWorkJobs'
        AND payload::text LIKE '%${JOB_ID.replace(/'/g, "''")}%'
      LIMIT 5
    ) r
  )
) AS doc;
`;
  const res = spawnSync("psql", [PG, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql], {
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (res.status !== 0) {
    return {
      source: "postgres",
      error: redact(res.stderr || res.stdout || `psql_exit_${res.status}`),
    };
  }
  try {
    const doc = JSON.parse(String(res.stdout || "").trim());
    const events = Array.isArray(doc.reliability) ? doc.reliability.map(slimEvent) : [];
    let job = null;
    let userStateUpdatedAt = null;
    for (const row of doc.user_state_rows || []) {
      userStateUpdatedAt = row.updated_at ?? userStateUpdatedAt;
      try {
        const payload = JSON.parse(row.payload_text);
        const jobs =
          payload?.payload?.jobs || payload?.jobs || [];
        const hit = (Array.isArray(jobs) ? jobs : []).find((j) => j?.id === JOB_ID);
        if (hit) {
          job = slimJob(hit);
          break;
        }
      } catch {
        // ignore parse
      }
    }
    return {
      source: "postgres",
      job,
      reliabilityEvents: events,
      userStateFound: Boolean(job),
      userStateUpdatedAt,
    };
  } catch (err) {
    return { source: "postgres", error: redact(err) };
  }
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!JOB_ID) {
    console.error(JSON.stringify({ ok: false, error: "DIAGNOSE_JOB_ID required" }));
    process.exit(2);
  }

  const evidence = {
    ok: false,
    jobId: JOB_ID,
    fetchedAt: new Date().toISOString(),
    job: null,
    reliabilityEvents: [],
    sourcesTried: [],
    error: null,
  };

  let result = await viaSupabase();
  if (result) {
    evidence.sourcesTried.push("supabase_service_role");
    evidence.job = result.job;
    evidence.reliabilityEvents = result.reliabilityEvents || [];
    evidence.userStateFound = result.userStateFound;
    evidence.userStateUpdatedAt = result.userStateUpdatedAt ?? null;
    if (result.reliabilityError) evidence.reliabilityError = result.reliabilityError;
    if (result.userStateError) evidence.userStateError = result.userStateError;
  }

  if (!evidence.job || !evidence.reliabilityEvents.length) {
    const pg = viaPostgres();
    if (pg) {
      evidence.sourcesTried.push("postgres");
      if (!evidence.job && pg.job) evidence.job = pg.job;
      if (!evidence.reliabilityEvents.length && pg.reliabilityEvents) {
        evidence.reliabilityEvents = pg.reliabilityEvents;
      }
      if (pg.error) evidence.pgError = pg.error;
      if (pg.userStateFound) evidence.userStateFound = true;
      if (pg.userStateUpdatedAt) evidence.userStateUpdatedAt = pg.userStateUpdatedAt;
    }
  }

  if (!SUPABASE_URL && !SERVICE && !PG) {
    evidence.error = "missing_supabase_or_postgres_secrets";
  } else if (!evidence.job && !evidence.reliabilityEvents.length) {
    evidence.error = "job_not_found_in_user_state_or_reliability";
  } else {
    evidence.ok = true;
  }

  // Derived root-cause hints (still evidence-based fields only)
  evidence.derived = {
    status: evidence.job?.status ?? null,
    error: evidence.job?.error ?? null,
    failedStage:
      evidence.job?.failureDiagnostic?.failedStage ??
      evidence.job?.visionGate?.failedStage ??
      evidence.reliabilityEvents[0]?.stage ??
      null,
    developerCode:
      evidence.job?.failureDiagnostic?.developerCode ??
      evidence.job?.visionGate?.developerCode ??
      evidence.reliabilityEvents[0]?.error_code ??
      null,
    diagnosticId:
      evidence.job?.failureDiagnostic?.diagnosticId ??
      evidence.job?.visionGate?.diagnosticId ??
      evidence.reliabilityEvents[0]?.diagnostic_id ??
      null,
    createdAt: evidence.job?.createdAt ?? null,
    updatedAt: evidence.job?.updatedAt ?? null,
    completedAt: evidence.job?.completedAt ?? null,
  };

  const path = join(OUT, `diagnose-${JOB_ID}.json`);
  writeFileSync(path, JSON.stringify(evidence, null, 2));
  console.log(
    JSON.stringify({
      ok: evidence.ok,
      evidencePath: path,
      sourcesTried: evidence.sourcesTried,
      status: evidence.derived.status,
      failedStage: evidence.derived.failedStage,
      developerCode: evidence.derived.developerCode,
      diagnosticId: evidence.derived.diagnosticId,
      error: evidence.derived.error || evidence.error,
      reliabilityEventCount: evidence.reliabilityEvents.length,
      jobFound: Boolean(evidence.job),
    }),
  );
  process.exit(evidence.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(JSON.stringify({ ok: false, error: redact(err?.message || err) }));
  process.exit(1);
});
