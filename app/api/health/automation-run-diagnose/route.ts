import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PHASE2_NEEDLE = "MINERVOT自動化テスト";

type JsonObject = Record<string, unknown>;

function asObject(value: unknown): JsonObject | null {
  return value && typeof value === "object" ? (value as JsonObject) : null;
}

function buildBody(input: {
  requestId: string;
  diagnosticId: string;
  lookupMode: string;
  runRow: JsonObject;
  automationRow: JsonObject | null;
}) {
  const payload = asObject(input.runRow.payload) ?? {};
  const workflow = asObject(input.automationRow?.workflow) ?? {};
  const steps = Array.isArray(workflow.steps)
    ? (workflow.steps as JsonObject[])
    : [];
  const instruction = asObject(input.automationRow?.instruction) ?? {};
  const structured = asObject(instruction.structuredOptions) ?? {};
  const runSteps = Array.isArray(payload.steps)
    ? (payload.steps as JsonObject[])
    : [];
  const evidence = asObject(payload.completionEvidence);
  const approval = asObject(payload.approval);
  const statusHistory = Array.isArray(payload.statusHistory)
    ? (payload.statusHistory as JsonObject[])
    : [];
  const externalActionIds = Array.isArray(evidence?.externalActionIds)
    ? (evidence!.externalActionIds as unknown[]).filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  const calendarStep = runSteps.find(
    (step) => step.capabilityId === "google_calendar",
  );
  const calendarArtifactExternalIds = Array.isArray(payload.artifacts)
    ? (payload.artifacts as JsonObject[])
        .filter(
          (item) =>
            typeof item.externalId === "string" &&
            item.externalId.trim().length > 0,
        )
        .map((item) => String(item.externalId))
    : [];
  const eventIds = [...new Set([...externalActionIds, ...calendarArtifactExternalIds])];
  const transitionReasons = statusHistory.map((entry) => ({
    from: entry.previousStatus ?? null,
    to: entry.nextStatus ?? null,
    reason: entry.reason ?? null,
  }));

  return {
    ok: true,
    lookup: {
      requestId: input.requestId || null,
      diagnosticId: input.diagnosticId || null,
      mode: input.lookupMode,
    },
    run: {
      id: input.runRow.id,
      automationId: input.runRow.automation_id ?? payload.automationId ?? null,
      status: input.runRow.status,
      diagnosticId: payload.diagnosticId ?? null,
      scheduleOccurrenceKey:
        input.runRow.schedule_occurrence_key ??
        payload.scheduleOccurrenceKey ??
        null,
      runKey: input.runRow.run_key ?? payload.runKey ?? null,
      idempotencyKey:
        input.runRow.idempotency_key ?? payload.idempotencyKey ?? null,
      attemptCount: input.runRow.attempt_count,
      lastErrorCode: input.runRow.last_error_code,
      lastErrorMessage:
        typeof input.runRow.last_error_message === "string"
          ? input.runRow.last_error_message.slice(0, 400)
          : null,
      resultSummary:
        typeof input.runRow.result_summary === "string"
          ? input.runRow.result_summary.slice(0, 400)
          : null,
      triggerType: input.runRow.trigger_type,
      queuedAt: input.runRow.queued_at ?? payload.queuedAt ?? null,
      startedAt: input.runRow.started_at ?? payload.startedAt ?? null,
      completedAt: input.runRow.completed_at ?? payload.completedAt ?? null,
      createdAt: input.runRow.created_at ?? payload.createdAt ?? null,
      runStepCapabilityIds: runSteps.map((step) => ({
        id: step.id ?? null,
        capabilityId: step.capabilityId ?? null,
        status: step.status ?? null,
        errorCode: step.errorCode ?? null,
        outputSummary:
          typeof step.outputSummary === "string"
            ? step.outputSummary.slice(0, 200)
            : null,
      })),
      googleCalendarStepStatus: calendarStep?.status ?? null,
      externalActionIds,
      googleCalendarEventIds: eventIds,
      completionEvidence: evidence
        ? {
            hasEvidence: true,
            artifactIds: Array.isArray(evidence.artifactIds)
              ? evidence.artifactIds.length
              : 0,
            externalActionIds,
            storageObjectIds: Array.isArray(evidence.storageObjectIds)
              ? evidence.storageObjectIds.length
              : 0,
            notificationIds: Array.isArray(evidence.notificationIds)
              ? evidence.notificationIds.length
              : 0,
          }
        : { hasEvidence: false },
      approvalStatus: approval?.status ?? null,
      approvalMode: approval?.mode ?? null,
      transitionReasons,
    },
    automation: input.automationRow
      ? {
          id: input.automationRow.id,
          name: input.automationRow.name ?? null,
          status: input.automationRow.status ?? null,
          nextRunAt: input.automationRow.next_run_at ?? null,
          legacyAutomationId:
            input.automationRow.legacy_automation_id ?? null,
          enabledStepTypes: steps
            .filter((step) => step.enabled !== false)
            .map((step) => step.type),
          hasGoogleCalendarStep: steps.some(
            (step) =>
              step.enabled !== false && step.type === "google_calendar",
          ),
          requiredExternalsDeclared: Array.isArray(structured.requiredExternals)
            ? structured.requiredExternals
            : null,
          freeformNotesPreview:
            typeof instruction.freeformNotes === "string"
              ? instruction.freeformNotes.slice(0, 240)
              : "",
          source: structured.source ?? null,
        }
      : null,
    derived: {
      googleOAuthReached: runSteps.some(
        (step) =>
          step.capabilityId === "google_calendar" &&
          step.status !== "pending",
      ),
      googleCalendarExecuted: calendarStep?.status === "succeeded",
      hasRealEventId: eventIds.length > 0,
      approvalPathObserved: {
        awaitedApproval: transitionReasons.some(
          (item) => item.to === "awaiting_approval",
        ),
        approvedToQueued: transitionReasons.some(
          (item) =>
            item.from === "awaiting_approval" &&
            item.to === "queued" &&
            (item.reason === "approved" ||
              String(item.reason ?? "").includes("approv")),
        ),
        claimedRunning: transitionReasons.some(
          (item) => item.to === "running",
        ),
        terminalSucceeded: input.runRow.status === "succeeded",
      },
      stoppedAt: steps.some(
        (step) => step.enabled !== false && step.type === "google_calendar",
      )
        ? eventIds.length > 0
          ? "google_calendar_event_id_present"
          : "google_calendar_step_present"
        : "external_step_missing_before_adapter",
      looksFake:
        eventIds.length === 0 ||
        eventIds.some((id) =>
          /^(mock_|fake_|test_|placeholder)/i.test(id),
        ),
    },
  };
}

async function findPhase2CalendarSuccess(
  sb: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
): Promise<{ runRow: JsonObject; automationRow: JsonObject | null } | null> {
  const { data: runs, error } = await sb
    .from("atlas_automation_runs")
    .select("*")
    .eq("status", "succeeded")
    .order("completed_at", { ascending: false })
    .limit(80);
  if (error) {
    throw new Error(`phase2_success_scan:${error.message.slice(0, 160)}`);
  }

  for (const row of (runs as JsonObject[] | null) ?? []) {
    const payload = asObject(row.payload) ?? {};
    const runSteps = Array.isArray(payload.steps)
      ? (payload.steps as JsonObject[])
      : [];
    const evidence = asObject(payload.completionEvidence);
    const externalActionIds = Array.isArray(evidence?.externalActionIds)
      ? (evidence!.externalActionIds as unknown[]).filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : [];
    const calendarSucceeded = runSteps.some(
      (step) =>
        step.capabilityId === "google_calendar" && step.status === "succeeded",
    );
    if (!calendarSucceeded || externalActionIds.length === 0) continue;

    const automationId = String(row.automation_id ?? "");
    if (!automationId) continue;
    const { data: automationRow, error: automationError } = await sb
      .from("atlas_automations")
      .select("*")
      .eq("id", automationId)
      .maybeSingle();
    if (automationError) {
      throw new Error(
        `phase2_automation_lookup:${automationError.message.slice(0, 160)}`,
      );
    }
    const instruction = asObject(
      (automationRow as JsonObject | null)?.instruction,
    );
    const freeform =
      typeof instruction?.freeformNotes === "string"
        ? instruction.freeformNotes
        : "";
    const name =
      typeof (automationRow as JsonObject | null)?.name === "string"
        ? String((automationRow as JsonObject).name)
        : "";
    const resultSummary =
      typeof row.result_summary === "string" ? row.result_summary : "";
    const haystack = `${freeform}\n${name}\n${resultSummary}`;
    if (!haystack.includes(PHASE2_NEEDLE) && !haystack.includes("MINERVOT")) {
      // Still accept calendar success with real event ids from recent Phase 2.
      // Prefer needle match when present.
      continue;
    }
    return {
      runRow: row,
      automationRow: (automationRow as JsonObject | null) ?? null,
    };
  }

  // Fallback: latest succeeded calendar run with event id (even if needle absent).
  for (const row of (runs as JsonObject[] | null) ?? []) {
    const payload = asObject(row.payload) ?? {};
    const runSteps = Array.isArray(payload.steps)
      ? (payload.steps as JsonObject[])
      : [];
    const evidence = asObject(payload.completionEvidence);
    const externalActionIds = Array.isArray(evidence?.externalActionIds)
      ? (evidence!.externalActionIds as unknown[]).filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
      : [];
    const calendarSucceeded = runSteps.some(
      (step) =>
        step.capabilityId === "google_calendar" && step.status === "succeeded",
    );
    if (!calendarSucceeded || externalActionIds.length === 0) continue;
    const automationId = String(row.automation_id ?? "");
    const { data: automationRow } = await sb
      .from("atlas_automations")
      .select("*")
      .eq("id", automationId)
      .maybeSingle();
    return {
      runRow: row,
      automationRow: (automationRow as JsonObject | null) ?? null,
    };
  }
  return null;
}

/**
 * CRON_SECRET / Owner only — Production Automation V2 run diagnose by
 * requestId / diagnosticId, or phase2CalendarSuccess=1 for latest Calendar E2E.
 * Returns redacted definition + run step evidence (no tokens/secrets).
 */
export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId")?.trim() || "";
  const diagnosticId = url.searchParams.get("diagnosticId")?.trim() || "";
  const phase2CalendarSuccess =
    url.searchParams.get("phase2CalendarSuccess") === "1";
  if (!requestId && !diagnosticId && !phase2CalendarSuccess) {
    return Response.json(
      {
        ok: false,
        error: "requestId_or_diagnosticId_or_phase2CalendarSuccess_required",
      },
      { status: 400, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const sb = createServiceRoleClientIfConfigured();
  if (!sb) {
    return Response.json(
      { ok: false, error: "supabase_not_configured" },
      { status: 503, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  let runRow: JsonObject | null = null;
  let automationRow: JsonObject | null = null;
  let lookupMode = "by_id";

  if (phase2CalendarSuccess && !requestId && !diagnosticId) {
    try {
      const found = await findPhase2CalendarSuccess(sb);
      if (!found) {
        return Response.json(
          {
            ok: false,
            error: "phase2_calendar_success_not_found",
            hint: "No succeeded run with google_calendar + externalActionIds",
          },
          { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
        );
      }
      runRow = found.runRow;
      automationRow = found.automationRow;
      lookupMode = "phase2CalendarSuccess";
    } catch (error) {
      return Response.json(
        {
          ok: false,
          error:
            error instanceof Error
              ? error.message.slice(0, 200)
              : "phase2_scan_failed",
        },
        { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
  }

  if (!runRow && requestId) {
    const { data, error } = await sb
      .from("atlas_automation_runs")
      .select("*")
      .eq("id", requestId)
      .maybeSingle();
    if (error) {
      return Response.json(
        { ok: false, error: `run_lookup:${error.message.slice(0, 160)}` },
        { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    runRow = (data as JsonObject | null) ?? null;
    lookupMode = "requestId";
  }
  if (!runRow && diagnosticId) {
    const { data, error } = await sb
      .from("atlas_automation_runs")
      .select("*")
      .filter("payload->>diagnosticId", "eq", diagnosticId)
      .limit(5);
    if (error) {
      return Response.json(
        { ok: false, error: `diagnostic_lookup:${error.message.slice(0, 160)}` },
        { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    runRow = Array.isArray(data)
      ? ((data[0] as JsonObject | undefined) ?? null)
      : null;
    lookupMode = "diagnosticId";
  }

  if (!runRow) {
    return Response.json(
      { ok: false, error: "run_not_found", requestId, diagnosticId },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  if (!automationRow) {
    const automationId = String(runRow.automation_id ?? "");
    const { data, error: automationError } = await sb
      .from("atlas_automations")
      .select("*")
      .eq("id", automationId)
      .maybeSingle();
    if (automationError) {
      return Response.json(
        {
          ok: false,
          error: `automation_lookup:${automationError.message.slice(0, 160)}`,
        },
        { status: 500, headers: { "Cache-Control": "no-store, max-age=0" } },
      );
    }
    automationRow = (data as JsonObject | null) ?? null;
  }

  const body = buildBody({
    requestId: String(runRow.id ?? requestId),
    diagnosticId,
    lookupMode,
    runRow,
    automationRow,
  });

  console.info("[health/automation-run-diagnose]", {
    ok: true,
    lookupMode,
    requestIdPrefix: String(runRow.id ?? "").slice(0, 8) || null,
    hasCalendar: body.automation?.hasGoogleCalendarStep ?? null,
    hasEventId: body.derived.hasRealEventId,
    status: body.run.status,
    stoppedAt: body.derived.stoppedAt,
  });

  return Response.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
