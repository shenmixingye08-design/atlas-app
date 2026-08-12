#!/usr/bin/env node
/**
 * Production Automation V2 run diagnostic (redacted).
 *
 * Modes:
 *   DIAGNOSE_REQUEST_ID / DIAGNOSE_DIAGNOSTIC_ID — lookup one run
 *   PHASE2_CALENDAR_SUCCESS=1 — scan latest Calendar success evidence
 *
 * Env:
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
const PHASE2 = process.env.PHASE2_CALENDAR_SUCCESS === "1";
const PHASE2_NEEDLE = "MINERVOT自動化テスト";
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
const SUPABASE_ACCESS_TOKEN =
  process.env.SUPABASE_ACCESS_TOKEN?.trim() ||
  process.env.SUPABASE_MANAGEMENT_TOKEN?.trim() ||
  "";
const SUPABASE_PROJECT_REF = process.env.SUPABASE_PROJECT_REF?.trim() || "";

function redactId(id) {
  if (!id || typeof id !== "string") return null;
  if (id.length <= 8) return "***";
  return `${id.slice(0, 6)}…${id.slice(-4)}`;
}

function asObject(value) {
  return value && typeof value === "object" ? value : null;
}

function extractExternalIds(payload) {
  const evidence = asObject(payload?.completionEvidence);
  const fromEvidence = Array.isArray(evidence?.externalActionIds)
    ? evidence.externalActionIds.filter(
        (id) => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  const fromArtifacts = Array.isArray(payload?.artifacts)
    ? payload.artifacts
        .map((item) => item?.externalId)
        .filter((id) => typeof id === "string" && id.trim().length > 0)
    : [];
  return [...new Set([...fromEvidence, ...fromArtifacts])];
}

function hasSucceededCalendarStep(payload) {
  const steps = Array.isArray(payload?.steps) ? payload.steps : [];
  return steps.some(
    (step) =>
      (step?.capabilityId === "google_calendar" ||
        step?.type === "google_calendar") &&
      step?.status === "succeeded",
  );
}

function matchesNeedle({ freeform = "", name = "", resultSummary = "", extra = "" }) {
  const haystack = `${freeform}\n${name}\n${resultSummary}\n${extra}`;
  return haystack.includes(PHASE2_NEEDLE) || haystack.includes("MINERVOT");
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
  const externalActionIds = extractExternalIds(payload);
  const statusHistory = Array.isArray(payload.statusHistory)
    ? payload.statusHistory
    : Array.isArray(row.status_history)
      ? row.status_history
      : [];
  return {
    id: row.id,
    automationId: row.automation_id ?? payload.automationId ?? null,
    userIdRedacted: redactId(row.user_id ?? payload.userId),
    status: row.status ?? payload.status ?? null,
    diagnosticId: payload.diagnosticId ?? null,
    scheduleOccurrenceKey:
      row.schedule_occurrence_key ?? payload.scheduleOccurrenceKey ?? null,
    runKey: row.run_key ?? payload.runKey ?? null,
    idempotencyKey: row.idempotency_key ?? payload.idempotencyKey ?? null,
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
      capabilityId: s?.capabilityId ?? s?.type ?? null,
      status: s?.status ?? null,
      errorCode: s?.errorCode ?? null,
      outputSummary:
        typeof s?.outputSummary === "string" ? s.outputSummary.slice(0, 200) : null,
    })),
    googleCalendarStepStatus:
      steps.find(
        (s) =>
          s?.capabilityId === "google_calendar" || s?.type === "google_calendar",
      )?.status ?? null,
    externalActionIds,
    googleCalendarEventIds: externalActionIds,
    completionEvidence: evidence
      ? {
          hasEvidence: true,
          artifactIds: Array.isArray(evidence.artifactIds)
            ? evidence.artifactIds.length
            : 0,
          externalActionIds: Array.isArray(evidence.externalActionIds)
            ? evidence.externalActionIds.filter(
                (id) => typeof id === "string" && id.trim(),
              )
            : [],
          storageObjectIds: Array.isArray(evidence.storageObjectIds)
            ? evidence.storageObjectIds.length
            : 0,
          notificationIds: Array.isArray(evidence.notificationIds)
            ? evidence.notificationIds.length
            : 0,
        }
      : { hasEvidence: false },
    approvalStatus: payload.approval?.status ?? null,
    approvalMode: payload.approval?.mode ?? null,
    transitionReasons: statusHistory.map((entry) => ({
      from: entry?.previousStatus ?? null,
      to: entry?.nextStatus ?? null,
      reason: entry?.reason ?? null,
    })),
  };
}

async function loadAutomation(sb, automationId) {
  if (!automationId) return null;
  const { data, error } = await sb
    .from("atlas_automations")
    .select("*")
    .eq("id", automationId)
    .maybeSingle();
  if (error) throw new Error(`automation: ${error.message}`);
  return data;
}

async function findPhase2ViaSupabase(sb) {
  const { data: claims, error: claimError } = await sb
    .from("atlas_side_effect_claims")
    .select(
      "id,run_id,automation_id,provider_resource_id,occurrence_key,status,completed_at,result_payload,evidence",
    )
    .eq("provider", "google_calendar")
    .eq("action_type", "create_event")
    .eq("status", "succeeded")
    .not("provider_resource_id", "is", null)
    .order("completed_at", { ascending: false })
    .limit(40);
  if (claimError) throw new Error(`phase2_claim_scan: ${claimError.message}`);

  const claimRows = Array.isArray(claims) ? claims : [];
  claimRows.sort((a, b) => {
    const aBlob = JSON.stringify(a.result_payload ?? a.evidence ?? "");
    const bBlob = JSON.stringify(b.result_payload ?? b.evidence ?? "");
    const aHit =
      aBlob.includes(PHASE2_NEEDLE) || aBlob.includes("MINERVOT") ? 1 : 0;
    const bHit =
      bBlob.includes(PHASE2_NEEDLE) || bBlob.includes("MINERVOT") ? 1 : 0;
    return bHit - aHit;
  });

  for (const claim of claimRows) {
    if (!claim.run_id) continue;
    const { data: runRow, error } = await sb
      .from("atlas_automation_runs")
      .select("*")
      .eq("id", claim.run_id)
      .maybeSingle();
    if (error) throw new Error(`phase2_claim_run: ${error.message}`);
    if (!runRow) continue;
    const automationRow = await loadAutomation(
      sb,
      runRow.automation_id ?? claim.automation_id,
    );
    return {
      runRow,
      automationRow,
      via: "side_effect_claim",
      providerResourceId: claim.provider_resource_id ?? null,
      occurrenceKeyFromClaim: claim.occurrence_key ?? null,
    };
  }

  const { data: runs, error } = await sb
    .from("atlas_automation_runs")
    .select("*")
    .in("status", ["succeeded", "partially_succeeded"])
    .order("completed_at", { ascending: false })
    .limit(120);
  if (error) throw new Error(`phase2_success_scan: ${error.message}`);

  const fallback = [];
  for (const runRow of runs ?? []) {
    const payload = asObject(runRow.payload) ?? {};
    const ids = extractExternalIds(payload);
    if (!hasSucceededCalendarStep(payload) || ids.length === 0) continue;
    const automationRow = await loadAutomation(sb, runRow.automation_id);
    const instruction = asObject(automationRow?.instruction) ?? {};
    const hit = {
      runRow,
      automationRow,
      via: "run_payload",
      providerResourceId: ids[0] ?? null,
      occurrenceKeyFromClaim: null,
    };
    if (
      matchesNeedle({
        freeform:
          typeof instruction.freeformNotes === "string"
            ? instruction.freeformNotes
            : "",
        name: typeof automationRow?.name === "string" ? automationRow.name : "",
        resultSummary:
          typeof runRow.result_summary === "string" ? runRow.result_summary : "",
      })
    ) {
      return hit;
    }
    fallback.push(hit);
  }
  return fallback[0] ?? null;
}

async function buildScanSummary(sb) {
  const { data: recentRuns } = await sb
    .from("atlas_automation_runs")
    .select("status,result_summary,payload")
    .order("created_at", { ascending: false })
    .limit(120);
  const recentRunStatusCounts = {};
  let succeededRunCount = 0;
  let calendarSucceededWithExternalIds = 0;
  const sampleCapabilityIds = [];
  const sampleResultSummaries = [];
  for (const row of recentRuns ?? []) {
    const status = String(row.status ?? "unknown");
    recentRunStatusCounts[status] = (recentRunStatusCounts[status] ?? 0) + 1;
    if (status === "succeeded") succeededRunCount += 1;
    const payload = asObject(row.payload) ?? {};
    for (const step of Array.isArray(payload.steps) ? payload.steps : []) {
      const cap = String(step?.capabilityId ?? step?.type ?? "");
      if (cap && sampleCapabilityIds.length < 12 && !sampleCapabilityIds.includes(cap)) {
        sampleCapabilityIds.push(cap);
      }
    }
    if (hasSucceededCalendarStep(payload) && extractExternalIds(payload).length > 0) {
      calendarSucceededWithExternalIds += 1;
    }
    if (typeof row.result_summary === "string" && sampleResultSummaries.length < 5) {
      sampleResultSummaries.push(row.result_summary.slice(0, 120));
    }
  }
  const { data: claims } = await sb
    .from("atlas_side_effect_claims")
    .select("id")
    .eq("provider", "google_calendar")
    .eq("action_type", "create_event")
    .eq("status", "succeeded")
    .not("provider_resource_id", "is", null)
    .limit(40);
  const { data: automations } = await sb
    .from("atlas_automations")
    .select("id,name,instruction")
    .order("updated_at", { ascending: false })
    .limit(80);
  let automationsMatchingNeedle = 0;
  for (const row of automations ?? []) {
    const instruction = asObject(row.instruction) ?? {};
    if (
      matchesNeedle({
        freeform:
          typeof instruction.freeformNotes === "string"
            ? instruction.freeformNotes
            : "",
        name: typeof row.name === "string" ? row.name : "",
      })
    ) {
      automationsMatchingNeedle += 1;
    }
  }
  return {
    succeededRunCount,
    calendarSucceededWithExternalIds,
    recentRunStatusCounts,
    sideEffectCalendarSucceededWithResourceId: Array.isArray(claims)
      ? claims.length
      : 0,
    automationsMatchingNeedle,
    sampleCapabilityIds,
    sampleResultSummaries,
  };
}

async function viaSupabase() {
  const sb = createClient(SUPABASE_URL, SERVICE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  if (PHASE2 && !REQUEST_ID && !DIAGNOSTIC_ID) {
    const found = await findPhase2ViaSupabase(sb);
    if (!found) {
      return {
        runRow: null,
        automationRow: null,
        via: "supabase_phase2",
        phase2: null,
        scanSummary: await buildScanSummary(sb),
      };
    }
    return {
      runRow: found.runRow,
      automationRow: found.automationRow,
      via: "supabase_phase2",
      phase2: {
        via: found.via,
        providerResourceId: found.providerResourceId,
        occurrenceKeyFromClaim: found.occurrenceKeyFromClaim,
      },
      scanSummary: null,
    };
  }

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
  const automationRow = await loadAutomation(sb, runRow?.automation_id);
  return {
    runRow,
    automationRow,
    via: "supabase",
    phase2: null,
    scanSummary: null,
  };
}

function buildLookupSql() {
  return `
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
}

function viaPostgres() {
  const result = spawnSync(
    "psql",
    [PG, "-v", "ON_ERROR_STOP=1", "-t", "-A", "-c", buildLookupSql()],
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
    phase2: null,
    scanSummary: null,
  };
}

async function viaManagementApi() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${SUPABASE_PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SUPABASE_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query: buildLookupSql() }),
    },
  );
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`management_api_${res.status}:${text.slice(0, 400)}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error(`management_api_bad_json:${text.slice(0, 200)}`);
  }
  const row = Array.isArray(parsed) ? parsed[0] : parsed;
  const payload =
    row?.payload ??
    row?.json_build_object ??
    (row?.run || row?.automation ? row : null);
  if (!payload || typeof payload !== "object") {
    throw new Error(`management_api_unexpected:${text.slice(0, 300)}`);
  }
  return {
    runRow: payload.run ?? null,
    automationRow: payload.automation ?? null,
    via: "management_api",
    phase2: null,
    scanSummary: null,
  };
}

async function main() {
  mkdirSync(OUT, { recursive: true });
  if (!REQUEST_ID && !DIAGNOSTIC_ID && !PHASE2) {
    console.error(
      "DIAGNOSE_REQUEST_ID or DIAGNOSE_DIAGNOSTIC_ID or PHASE2_CALENDAR_SUCCESS=1 required",
    );
    process.exit(2);
  }

  let fetched;
  if (SUPABASE_URL && SERVICE) {
    fetched = await viaSupabase();
  } else if (PG && !PHASE2) {
    fetched = viaPostgres();
  } else if (SUPABASE_ACCESS_TOKEN && SUPABASE_PROJECT_REF && !PHASE2) {
    fetched = await viaManagementApi();
  } else {
    console.error(
      "No SUPABASE_SERVICE_ROLE_KEY / DATABASE_URL / SUPABASE_ACCESS_TOKEN+PROJECT_REF",
    );
    process.exit(3);
  }

  const run = summarizeRun(fetched.runRow);
  if (
    fetched.phase2?.providerResourceId &&
    run &&
    !run.googleCalendarEventIds.includes(fetched.phase2.providerResourceId)
  ) {
    run.googleCalendarEventIds = [
      ...run.googleCalendarEventIds,
      fetched.phase2.providerResourceId,
    ];
    run.externalActionIds = [
      ...new Set([...run.externalActionIds, fetched.phase2.providerResourceId]),
    ];
    if (run.completionEvidence?.hasEvidence) {
      run.completionEvidence.externalActionIds = run.externalActionIds;
    } else {
      run.completionEvidence = {
        hasEvidence: true,
        artifactIds: 0,
        externalActionIds: run.externalActionIds,
        storageObjectIds: 0,
        notificationIds: 0,
      };
    }
  }
  if (
    fetched.phase2?.occurrenceKeyFromClaim &&
    run &&
    !run.scheduleOccurrenceKey
  ) {
    run.scheduleOccurrenceKey = fetched.phase2.occurrenceKeyFromClaim;
  }

  const report = {
    ok: Boolean(fetched.runRow),
    via: fetched.via,
    lookup: {
      requestId: REQUEST_ID || null,
      diagnosticId: DIAGNOSTIC_ID || null,
      mode: PHASE2 ? "phase2CalendarSuccess" : "by_id",
    },
    run,
    automation: summarizeAutomation(fetched.automationRow),
    phase2: fetched.phase2,
    scanSummary: fetched.scanSummary,
    derived: {
      googleCalendarStepPresent: Boolean(
        fetched.automationRow &&
          summarizeAutomation(fetched.automationRow)?.hasGoogleCalendarStep,
      ),
      googleCalendarExecuted: run?.googleCalendarStepStatus === "succeeded",
      hasRealEventId: Boolean(run?.googleCalendarEventIds?.length),
      looksFake: Boolean(
        run?.googleCalendarEventIds?.some((id) =>
          /^(mock_|fake_|test_|placeholder)/i.test(id),
        ),
      ),
      approvalPathObserved: {
        awaitedApproval: Boolean(
          run?.transitionReasons?.some((item) => item.to === "awaiting_approval"),
        ),
        approvedToQueued: Boolean(
          run?.transitionReasons?.some(
            (item) =>
              item.from === "awaiting_approval" && item.to === "queued",
          ),
        ),
        claimedRunning: Boolean(
          run?.transitionReasons?.some((item) => item.to === "running"),
        ),
        terminalSucceeded: run?.status === "succeeded",
      },
      stoppedAt:
        run?.googleCalendarEventIds?.length > 0
          ? "google_calendar_event_id_present"
          : fetched.automationRow &&
              summarizeAutomation(fetched.automationRow)?.hasGoogleCalendarStep
            ? "google_calendar_step_present"
            : "before_google_calendar_step_or_step_missing_in_definition",
    },
  };

  const outPath = join(OUT, PHASE2 ? "health-diagnose.json" : "diagnose-automation-run.json");
  writeFileSync(outPath, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  console.log(`wrote ${outPath}`);
  process.exit(report.ok ? 0 : 4);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
