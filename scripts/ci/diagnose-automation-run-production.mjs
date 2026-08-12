#!/usr/bin/env node
/**
 * Production Automation V2 run diagnostic (redacted).
 * Looks up atlas_automation_runs by requestId (= run id) and/or diagnosticId
 * (payload.diagnosticId), then loads the parent atlas_automations definition.
 *
 * Env:
 *   DIAGNOSE_REQUEST_ID (run id / requestId) and/or DIAGNOSE_DIAGNOSTIC_ID
 *   SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY
 *   OR DATABASE_URL / POSTGRES_URL (psql JSON query)
 *   DIAGNOSE_OUT (output dir)
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const REQUEST_ID = process.env.DIAGNOSE_REQUEST_ID?.trim() || "";
const DIAGNOSTIC_ID = process.env.DIAGNOSE_DIAGNOSTIC_ID?.trim() || "";
const OUT =
  process.env.DIAGNOSE_OUT?.trim() ||
  join(process.cwd(), "tmp", "diagnose-automation-run");
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

function redactId(id) {
  if (!id || typeof id !== "string") return null;
  if (id.length <= 8) return "***";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function summarizeAutomation(row) {
  if (!row) return null;
  const workflow = row.workflow && typeof row.workflow === "object" ? row.workflow : {};
  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const instruction =
    row.instruction && typeof row.instruction === "object" ? row.instruction : {};
  const structured =
    instruction.structuredOptions && typeof instruction.structuredOptions === "object"
      ? instruction.structuredOptions
      : {};
  const freeformNotes =
    typeof instruction.freeformNotes === "string" ? instruction.freeformNotes : "";
  return {
    id: row.id,
    userIdRedacted: redactId(row.user_id ?? row.userId),
    name: row.name ?? null,
    status: row.status ?? null,
    legacyAutomationId: row.legacy_automation_id ?? row.legacyAutomationId ?? null,
    createdAt: row.created_at ?? row.createdAt ?? null,
    updatedAt: row.updated_at ?? row.updatedAt ?? null,
    nextRunAt: row.next_run_at ?? row.nextRunAt ?? null,
    stepTypes: steps.map((s) => ({
      id: s?.id ?? null,
      type: s?.type ?? null,
      enabled: s?.enabled !== false,
      requiresApproval: Boolean(s?.requiresApproval),
      order: s?.order ?? null,
      configKeys: s?.configuration ? Object.keys(s.configuration) : [],
    })),
    enabledStepTypes: steps.filter((s) => s?.enabled !== false).map((s) => s?.type),
    hasGoogleCalendarStep: steps.some(
      (s) => s?.enabled !== false && s?.type === "google_calendar",
    ),
    requiredExternalsDeclared: Array.isArray(structured.requiredExternals)
      ? structured.requiredExternals
      : null,
    freeformNotesPreview: freeformNotes.slice(0, 240),
    source: structured.source ?? null,
  };
}

function summarizeRun(row) {
  if (!row) return null;
  const payload =
    row.payload && typeof row.payload === "object" ? row.payload : {};
  const steps = Array.isArray(payload.steps)
    ? payload.steps
    : Array.isArray(row.steps)
      ? row.steps
      : [];
  const evidence =
    payload.completionEvidence && typeof payload.completionEvidence === "object"
      ? payload.completionEvidence
      : null;
  return {
    id: row.id,
    automationId: row.automation_id ?? payload.automationId ?? null,
    userIdRedacted: redactId(row.user_id ?? payload.userId),
    status: row.status ?? payload.status ?? null,
    diagnosticId: payload.diagnosticId ?? null,
    attemptCount: row.attempt_count ?? payload.attemptCount ?? null,
    lastErrorCode: row.last_error_code ?? payload.lastErrorCode ?? null,
    lastErrorMessage: (row.last_error_message ?? payload.lastErrorMessage ?? null)
      ? String(row.last_error_message ?? payload.lastErrorMessage).slice(0, 400)
      : null,
    resultSummary: (row.result_summary ?? payload.resultSummary ?? null)
      ? String(row.result_summary ?? payload.resultSummary).slice(0, 400)
      : null,
    triggerType: row.trigger_type ?? payload.triggerType ?? null,
    scheduledFor: row.scheduled_for ?? payload.scheduledFor ?? null,
    queuedAt: row.queued_at ?? payload.queuedAt ?? null,
    startedAt: row.started_at ?? payload.startedAt ?? null,
    completedAt: row.completed_at ?? payload.completedAt ?? null,
    createdAt: row.created_at ?? payload.createdAt ?? null,
    runStepCapabilityIds: steps.map((s) => ({
      id: s?.id ?? null,
      capabilityId: s?.capabilityId ?? null,
      status: s?.status ?? null,
      errorCode: s?.errorCode ?? null,
    })),
    externalActionIds: evidence?.externalActionIds ?? [],
    providerEventIds: evidence?.providerEventIds ?? [],
    approvalStatus: payload.approval?.status ?? null,
  };
}

async function viaSupabase() {
  const sb = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let runRow = null;
  if (REQUEST_ID) {
    const { data, error } = await sb
      .from("atlas_automation_runs")
      .select("*")
      .eq("id", REQUEST_ID)
      .maybeSingle();
    if (error) throw new Error(`run_by_id: ${error.message}`);
    runRow = data;
  }
  if (!runRow && DIAGNOSTIC_ID) {
    const { data, error } = await sb
      .from("atlas_automation_runs")
      .select("*")
      .filter("payload->>diagnosticId", "eq", DIAGNOSTIC_ID)
      .limit(5);
    if (error) throw new Error(`run_by_diagnostic: ${error.message}`);
    runRow = Array.isArray(data) ? data[0] ?? null : null;
  }
  let automationRow = null;
  const automationId = runRow?.automation_id;
  if (automationId) {
    const { data, error } = await sb
      .from("atlas_automations")
      .select("*")
      .eq("id", automationId)
      .maybeSingle();
    if (error) throw new Error(`automation: ${error.message}`);
    automationRow = data;
  }
  return { runRow, automationRow, via: "supabase" };
}

function viaPostgres() {
  const sql = `
WITH target AS (
  SELECT *
  FROM public.atlas_automation_runs
  WHERE (
    (${REQUEST_ID ? `'${REQUEST_ID.replace(/'/g, "''")}'` : "NULL"}::text IS NOT NULL
      AND id = '${REQUEST_ID.replace(/'/g, "''")}'::uuid)
    OR (
      ${DIAGNOSTIC_ID ? `'${DIAGNOSTIC_ID.replace(/'/g, "''")}'` : "NULL"}::text IS NOT NULL
      AND payload->>'diagnosticId' = '${DIAGNOSTIC_ID.replace(/'/g, "''")}'
    )
  )
  ORDER BY created_at DESC
  LIMIT 1
)
SELECT json_build_object(
  'run', (SELECT to_jsonb(t) FROM target t),
  'automation', (
    SELECT to_jsonb(a)
    FROM public.atlas_automations a
    WHERE a.id = (SELECT automation_id FROM target)
  )
) AS payload;
`;
  const result = spawnSync(
    "psql",
    [PG, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", sql],
    { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    throw new Error(`psql_failed: ${(result.stderr || result.stdout || "").slice(0, 500)}`);
  }
  const raw = (result.stdout || "").trim();
  if (!raw) throw new Error("psql_empty");
  const parsed = JSON.parse(raw);
  return {
    runRow: parsed.run ?? null,
    automationRow: parsed.automation ?? null,
    via: "postgres",
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!REQUEST_ID && !DIAGNOSTIC_ID) {
    console.error("DIAGNOSE_REQUEST_ID or DIAGNOSE_DIAGNOSTIC_ID required");
    process.exit(2);
  }

  let fetched;
  if (SUPABASE_URL && SERVICE) {
    fetched = await viaSupabase();
  } else if (PG) {
    fetched = viaPostgres();
  } else {
    console.error("No SUPABASE_SERVICE_ROLE_KEY or DATABASE_URL");
    process.exit(3);
  }

  const report = {
    ok: Boolean(fetched.runRow),
    via: fetched.via,
    lookup: {
      requestId: REQUEST_ID || null,
      diagnosticId: DIAGNOSTIC_ID || null,
    },
    run: summarizeRun(fetched.runRow),
    automation: summarizeAutomation(fetched.automationRow),
    derived: {
      googleCalendarStepPresent: Boolean(
        fetched.automationRow &&
          summarizeAutomation(fetched.automationRow)?.hasGoogleCalendarStep,
      ),
      stoppedAt:
        fetched.runRow &&
        summarizeAutomation(fetched.automationRow)?.hasGoogleCalendarStep
          ? "after_step_present_check_adapter_or_later"
          : "before_google_calendar_step_or_step_missing_in_definition",
    },
  };

  const outPath = join(OUT, "diagnose-automation-run.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${outPath}`);
  process.exit(report.ok ? 0 : 4);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
