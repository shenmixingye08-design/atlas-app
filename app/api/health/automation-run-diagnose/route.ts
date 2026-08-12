import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { createServiceRoleClientIfConfigured } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * CRON_SECRET / Owner only — Production Automation V2 run diagnose by
 * requestId (run id) and/or diagnosticId (payload.diagnosticId).
 * Returns redacted definition + run step evidence for fail-closed incidents.
 */
export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId")?.trim() || "";
  const diagnosticId = url.searchParams.get("diagnosticId")?.trim() || "";
  if (!requestId && !diagnosticId) {
    return Response.json(
      { ok: false, error: "requestId_or_diagnosticId_required" },
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

  let runRow: Record<string, unknown> | null = null;
  if (requestId) {
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
    runRow = (data as Record<string, unknown> | null) ?? null;
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
      ? ((data[0] as Record<string, unknown> | undefined) ?? null)
      : null;
  }

  if (!runRow) {
    return Response.json(
      { ok: false, error: "run_not_found", requestId, diagnosticId },
      { status: 404, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  const automationId = String(runRow.automation_id ?? "");
  const { data: automationRow, error: automationError } = await sb
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

  const payload =
    runRow.payload && typeof runRow.payload === "object"
      ? (runRow.payload as Record<string, unknown>)
      : {};
  const workflow =
    automationRow &&
    typeof automationRow === "object" &&
    (automationRow as { workflow?: { steps?: unknown } }).workflow &&
    typeof (automationRow as { workflow: unknown }).workflow === "object"
      ? (
          automationRow as {
            workflow: { steps?: Array<Record<string, unknown>> };
          }
        ).workflow
      : { steps: [] };
  const steps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const instruction =
    automationRow &&
    typeof (automationRow as { instruction?: unknown }).instruction === "object"
      ? ((automationRow as { instruction: Record<string, unknown> })
          .instruction ?? {})
      : {};
  const structured =
    instruction.structuredOptions &&
    typeof instruction.structuredOptions === "object"
      ? (instruction.structuredOptions as Record<string, unknown>)
      : {};
  const runSteps = Array.isArray(payload.steps)
    ? (payload.steps as Array<Record<string, unknown>>)
    : [];
  const evidence =
    payload.completionEvidence &&
    typeof payload.completionEvidence === "object"
      ? (payload.completionEvidence as Record<string, unknown>)
      : null;

  const body = {
    ok: true,
    lookup: { requestId: requestId || null, diagnosticId: diagnosticId || null },
    run: {
      id: runRow.id,
      automationId,
      status: runRow.status,
      diagnosticId: payload.diagnosticId ?? null,
      attemptCount: runRow.attempt_count,
      lastErrorCode: runRow.last_error_code,
      lastErrorMessage:
        typeof runRow.last_error_message === "string"
          ? runRow.last_error_message.slice(0, 400)
          : null,
      resultSummary:
        typeof runRow.result_summary === "string"
          ? runRow.result_summary.slice(0, 400)
          : null,
      triggerType: runRow.trigger_type,
      runStepCapabilityIds: runSteps.map((step) => ({
        id: step.id ?? null,
        capabilityId: step.capabilityId ?? null,
        status: step.status ?? null,
        errorCode: step.errorCode ?? null,
      })),
      externalActionIds: Array.isArray(evidence?.externalActionIds)
        ? evidence.externalActionIds
        : [],
      approvalStatus:
        payload.approval && typeof payload.approval === "object"
          ? ((payload.approval as { status?: string }).status ?? null)
          : null,
    },
    automation: automationRow
      ? {
          id: (automationRow as { id: string }).id,
          name: (automationRow as { name?: string }).name ?? null,
          status: (automationRow as { status?: string }).status ?? null,
          legacyAutomationId:
            (automationRow as { legacy_automation_id?: string | null })
              .legacy_automation_id ?? null,
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
      stoppedAt: steps.some(
        (step) => step.enabled !== false && step.type === "google_calendar",
      )
        ? "google_calendar_step_present"
        : "external_step_missing_before_adapter",
    },
  };

  console.info("[health/automation-run-diagnose]", {
    ok: true,
    requestIdPrefix: requestId.slice(0, 8) || null,
    diagnosticIdPrefix: diagnosticId.slice(0, 8) || null,
    hasCalendar: body.automation?.hasGoogleCalendarStep ?? null,
    stoppedAt: body.derived.stoppedAt,
  });

  return Response.json(body, {
    status: 200,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
