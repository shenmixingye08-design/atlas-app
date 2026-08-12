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

function extractExternalIdsFromRunPayload(payload: JsonObject): string[] {
  const evidence = asObject(payload.completionEvidence);
  const fromEvidence = Array.isArray(evidence?.externalActionIds)
    ? (evidence!.externalActionIds as unknown[]).filter(
        (id): id is string => typeof id === "string" && id.trim().length > 0,
      )
    : [];
  const fromArtifacts = Array.isArray(payload.artifacts)
    ? (payload.artifacts as JsonObject[])
        .map((item) => item.externalId)
        .filter(
          (id): id is string => typeof id === "string" && id.trim().length > 0,
        )
    : [];
  return [...new Set([...fromEvidence, ...fromArtifacts])];
}

function runHasSucceededCalendarStep(payload: JsonObject): boolean {
  const runSteps = Array.isArray(payload.steps)
    ? (payload.steps as JsonObject[])
    : [];
  return runSteps.some(
    (step) =>
      (step.capabilityId === "google_calendar" ||
        step.type === "google_calendar") &&
      step.status === "succeeded",
  );
}

function haystackMatchesPhase2Needle(input: {
  freeform: string;
  name: string;
  resultSummary: string;
  claimDiscriminator?: string;
}): boolean {
  const haystack = [
    input.freeform,
    input.name,
    input.resultSummary,
    input.claimDiscriminator ?? "",
  ].join("\n");
  return haystack.includes(PHASE2_NEEDLE) || haystack.includes("MINERVOT");
}

async function loadAutomationRow(
  sb: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
  automationId: string,
): Promise<JsonObject | null> {
  if (!automationId) return null;
  const { data, error } = await sb
    .from("atlas_automations")
    .select("*")
    .eq("id", automationId)
    .maybeSingle();
  if (error) {
    throw new Error(
      `phase2_automation_lookup:${error.message.slice(0, 160)}`,
    );
  }
  return (data as JsonObject | null) ?? null;
}

type Phase2ScanHit = {
  runRow: JsonObject;
  automationRow: JsonObject | null;
  via: "run_payload" | "side_effect_claim";
  providerResourceId: string | null;
};

type Phase2ScanSummary = {
  succeededRunCount: number;
  calendarSucceededWithExternalIds: number;
  recentRunStatusCounts: Record<string, number>;
  sideEffectCalendarSucceededWithResourceId: number;
  automationsMatchingNeedle: number;
  sampleCapabilityIds: string[];
  sampleResultSummaries: string[];
};

async function buildPhase2ScanSummary(
  sb: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
): Promise<Phase2ScanSummary> {
  const { data: recentRuns } = await sb
    .from("atlas_automation_runs")
    .select("status,result_summary,payload")
    .order("created_at", { ascending: false })
    .limit(120);
  const rows = (recentRuns as JsonObject[] | null) ?? [];
  const recentRunStatusCounts: Record<string, number> = {};
  let succeededRunCount = 0;
  let calendarSucceededWithExternalIds = 0;
  const sampleCapabilityIds: string[] = [];
  const sampleResultSummaries: string[] = [];
  for (const row of rows) {
    const status = String(row.status ?? "unknown");
    recentRunStatusCounts[status] = (recentRunStatusCounts[status] ?? 0) + 1;
    if (status === "succeeded") succeededRunCount += 1;
    const payload = asObject(row.payload) ?? {};
    const steps = Array.isArray(payload.steps)
      ? (payload.steps as JsonObject[])
      : [];
    for (const step of steps) {
      const cap = String(step.capabilityId ?? step.type ?? "");
      if (cap && sampleCapabilityIds.length < 12 && !sampleCapabilityIds.includes(cap)) {
        sampleCapabilityIds.push(cap);
      }
    }
    if (
      runHasSucceededCalendarStep(payload) &&
      extractExternalIdsFromRunPayload(payload).length > 0
    ) {
      calendarSucceededWithExternalIds += 1;
    }
    if (
      typeof row.result_summary === "string" &&
      sampleResultSummaries.length < 5
    ) {
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
    .order("completed_at", { ascending: false })
    .limit(40);

  const { data: automations } = await sb
    .from("atlas_automations")
    .select("id,name,instruction")
    .order("updated_at", { ascending: false })
    .limit(80);
  let automationsMatchingNeedle = 0;
  for (const row of (automations as JsonObject[] | null) ?? []) {
    const instruction = asObject(row.instruction);
    const freeform =
      typeof instruction?.freeformNotes === "string"
        ? instruction.freeformNotes
        : "";
    const name = typeof row.name === "string" ? row.name : "";
    if (haystackMatchesPhase2Needle({ freeform, name, resultSummary: "" })) {
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

async function findPhase2CalendarSuccess(
  sb: NonNullable<ReturnType<typeof createServiceRoleClientIfConfigured>>,
): Promise<Phase2ScanHit | null> {
  // Path A: durable side-effect claims (provider resource id = Calendar event id).
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
  if (claimError) {
    throw new Error(`phase2_claim_scan:${claimError.message.slice(0, 160)}`);
  }

  const claimRows = (claims as JsonObject[] | null) ?? [];
  const rankedClaims = [...claimRows].sort((a, b) => {
    const aPayload = JSON.stringify(a.result_payload ?? a.evidence ?? "");
    const bPayload = JSON.stringify(b.result_payload ?? b.evidence ?? "");
    const aHit =
      aPayload.includes(PHASE2_NEEDLE) || aPayload.includes("MINERVOT") ? 1 : 0;
    const bHit =
      bPayload.includes(PHASE2_NEEDLE) || bPayload.includes("MINERVOT") ? 1 : 0;
    return bHit - aHit;
  });

  for (const claim of rankedClaims) {
    const runId = typeof claim.run_id === "string" ? claim.run_id : "";
    if (!runId) continue;
    const { data: runData, error: runError } = await sb
      .from("atlas_automation_runs")
      .select("*")
      .eq("id", runId)
      .maybeSingle();
    if (runError) {
      throw new Error(`phase2_claim_run:${runError.message.slice(0, 160)}`);
    }
    if (!runData) continue;
    const runRow = runData as JsonObject;
    const automationRow = await loadAutomationRow(
      sb,
      String(runRow.automation_id ?? claim.automation_id ?? ""),
    );
    const instruction = asObject(automationRow?.instruction);
    const freeform =
      typeof instruction?.freeformNotes === "string"
        ? instruction.freeformNotes
        : "";
    const name =
      typeof automationRow?.name === "string" ? String(automationRow.name) : "";
    const resultSummary =
      typeof runRow.result_summary === "string" ? runRow.result_summary : "";
    const claimBlob = JSON.stringify(claim.result_payload ?? claim.evidence ?? "");
    const needleOk = haystackMatchesPhase2Needle({
      freeform,
      name,
      resultSummary,
      claimDiscriminator: claimBlob,
    });
    // Prefer needle; accept first durable Calendar claim if no needle match exists.
    if (!needleOk && rankedClaims.some((row) => {
      const blob = JSON.stringify(row.result_payload ?? row.evidence ?? "");
      return blob.includes(PHASE2_NEEDLE) || blob.includes("MINERVOT");
    })) {
      continue;
    }
    return {
      runRow,
      automationRow,
      via: "side_effect_claim",
      providerResourceId:
        typeof claim.provider_resource_id === "string"
          ? claim.provider_resource_id
          : null,
    };
  }

  // Path B: succeeded runs with google_calendar + external ids in payload.
  const { data: runs, error } = await sb
    .from("atlas_automation_runs")
    .select("*")
    .in("status", ["succeeded", "partially_succeeded"])
    .order("completed_at", { ascending: false })
    .limit(120);
  if (error) {
    throw new Error(`phase2_success_scan:${error.message.slice(0, 160)}`);
  }

  const candidates: Phase2ScanHit[] = [];
  for (const row of (runs as JsonObject[] | null) ?? []) {
    const payload = asObject(row.payload) ?? {};
    const externalActionIds = extractExternalIdsFromRunPayload(payload);
    if (!runHasSucceededCalendarStep(payload) || externalActionIds.length === 0) {
      continue;
    }
    const automationRow = await loadAutomationRow(
      sb,
      String(row.automation_id ?? ""),
    );
    const instruction = asObject(automationRow?.instruction);
    const freeform =
      typeof instruction?.freeformNotes === "string"
        ? instruction.freeformNotes
        : "";
    const name =
      typeof automationRow?.name === "string" ? String(automationRow.name) : "";
    const resultSummary =
      typeof row.result_summary === "string" ? row.result_summary : "";
    candidates.push({
      runRow: row,
      automationRow,
      via: "run_payload",
      providerResourceId: externalActionIds[0] ?? null,
    });
    if (
      haystackMatchesPhase2Needle({ freeform, name, resultSummary })
    ) {
      return {
        runRow: row,
        automationRow,
        via: "run_payload",
        providerResourceId: externalActionIds[0] ?? null,
      };
    }
  }
  return candidates[0] ?? null;
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
  let phase2Via: Phase2ScanHit["via"] | null = null;
  let phase2ProviderResourceId: string | null = null;

  if (phase2CalendarSuccess && !requestId && !diagnosticId) {
    try {
      const found = await findPhase2CalendarSuccess(sb);
      if (!found) {
        const scanSummary = await buildPhase2ScanSummary(sb);
        return Response.json(
          {
            ok: false,
            error: "phase2_calendar_success_not_found",
            hint:
              "No succeeded google_calendar run/claim with provider resource id",
            scanSummary,
          },
          { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
        );
      }
      runRow = found.runRow;
      automationRow = found.automationRow;
      lookupMode = "phase2CalendarSuccess";
      phase2Via = found.via;
      phase2ProviderResourceId = found.providerResourceId;
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

  // Merge durable claim resource id when run payload evidence is thin.
  if (
    phase2ProviderResourceId &&
    !body.run.googleCalendarEventIds.includes(phase2ProviderResourceId)
  ) {
    body.run.googleCalendarEventIds = [
      ...body.run.googleCalendarEventIds,
      phase2ProviderResourceId,
    ];
    body.run.externalActionIds = [
      ...new Set([...body.run.externalActionIds, phase2ProviderResourceId]),
    ];
    body.derived.hasRealEventId = true;
    body.derived.looksFake =
      body.run.googleCalendarEventIds.length === 0 ||
      body.run.googleCalendarEventIds.some((id) =>
        /^(mock_|fake_|test_|placeholder)/i.test(id),
      );
    body.derived.stoppedAt = "google_calendar_event_id_present";
  }

  const responseBody = {
    ...body,
    phase2: phase2Via
      ? {
          via: phase2Via,
          providerResourceId: phase2ProviderResourceId,
        }
      : null,
  };

  console.info("[health/automation-run-diagnose]", {
    ok: true,
    lookupMode,
    phase2Via,
    requestIdPrefix: String(runRow.id ?? "").slice(0, 8) || null,
    hasCalendar: body.automation?.hasGoogleCalendarStep ?? null,
    hasEventId: body.derived.hasRealEventId,
    status: body.run.status,
    stoppedAt: body.derived.stoppedAt,
  });

  return Response.json(responseBody, {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
