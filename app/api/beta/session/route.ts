import { randomUUID } from "crypto";

import { auth } from "@clerk/nextjs/server";

import { getBetaSession, upsertBetaSession } from "@/lib/beta-ux/store";
import type {
  BetaDeviceType,
  BetaFlowId,
  BetaPersona,
  DropoutReason,
} from "@/lib/beta-ux/types";
import { trackFunnelEvent } from "@/lib/product-funnel/events";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const FLOWS = new Set<string>([
  "A_word",
  "B_excel",
  "C_image_excel",
  "D_revise",
  "E_convert_pdf",
  "F_pptx",
  "G_notification",
  "H_external",
  "I_automation",
]);

const DROPOUTS = new Set<string>([
  "service_purpose_unclear",
  "request_entry_unclear",
  "attachment_ui_unclear",
  "format_selection_unclear",
  "too_many_questions",
  "job_too_slow",
  "progress_unclear",
  "error_message_unclear",
  "artifact_location_unclear",
  "preview_unclear",
  "download_unclear",
  "revision_unclear",
  "notification_missed",
  "external_connection_unclear",
  "mobile_layout_problem",
  "authentication_problem",
  "unsupported_request",
  "result_quality_low",
  "user_expected_different_output",
  "technical_failure",
  "unknown",
]);

function clip(value: unknown, max = 120): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t ? t.slice(0, max) : null;
}

/** Create or update a moderated/unmoderated β session (no prompt bodies). */
export async function POST(request: Request): Promise<Response> {
  await auth();
  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return Response.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const sessionId =
    clip(body.sessionId, 40) ?? `bs_${randomUUID().slice(0, 10)}`;
  const existing = getBetaSession(sessionId);
  const flowId = clip(body.flowId, 40);
  if (!flowId || !FLOWS.has(flowId)) {
    return Response.json({ error: "Invalid flowId" }, { status: 400 });
  }

  const personas = Array.isArray(body.personas)
    ? body.personas
        .filter((p): p is string => typeof p === "string")
        .slice(0, 8)
        .map((p) => p as BetaPersona)
    : existing?.personas ?? [];

  const deviceType = (clip(body.deviceType, 20) ??
    existing?.deviceType ??
    "unknown") as BetaDeviceType;

  const completed = Boolean(body.completed ?? existing?.completed);
  const downloaded = Boolean(body.downloaded ?? existing?.downloaded);
  const dropoutReasonRaw = clip(body.dropoutReason, 64);
  const dropoutReason =
    dropoutReasonRaw && DROPOUTS.has(dropoutReasonRaw)
      ? (dropoutReasonRaw as DropoutReason)
      : existing?.dropoutReason ?? null;

  const startedAt = existing?.startedAt ?? new Date().toISOString();
  const endedAt =
    completed || body.endedAt
      ? clip(body.endedAt, 40) ?? new Date().toISOString()
      : existing?.endedAt ?? null;

  const durationMs =
    typeof body.durationMs === "number"
      ? Math.max(0, Math.floor(body.durationMs))
      : endedAt
        ? Date.parse(endedAt) - Date.parse(startedAt)
        : existing?.durationMs ?? null;

  const row = upsertBetaSession({
    sessionId,
    anonymousUserId:
      clip(body.anonymousUserId, 40) ??
      existing?.anonymousUserId ??
      `anon_${randomUUID().slice(0, 8)}`,
    isBetaTester: Boolean(body.isBetaTester ?? true),
    personas,
    deviceType,
    viewport: clip(body.viewport, 32) ?? existing?.viewport ?? null,
    flowId: flowId as BetaFlowId,
    startedAt,
    endedAt,
    completed,
    downloaded,
    stuckScreen: clip(body.stuckScreen, 120) ?? existing?.stuckScreen ?? null,
    dropoutReason: completed ? null : dropoutReason,
    requestId: clip(body.requestId, 80) ?? existing?.requestId ?? null,
    jobId: clip(body.jobId, 80) ?? existing?.jobId ?? null,
    artifactId: clip(body.artifactId, 80) ?? existing?.artifactId ?? null,
    durationMs,
    clickCount:
      typeof body.clickCount === "number"
        ? Math.max(0, Math.floor(body.clickCount))
        : existing?.clickCount ?? null,
    notes: clip(body.notes, 300) ?? existing?.notes ?? null,
  });

  if (!completed && body.abandoned) {
    trackFunnelEvent("session_abandoned", {
      sessionId,
      anonymousUserId: row.anonymousUserId,
      currentScreen: row.stuckScreen,
      errorCode: row.dropoutReason,
      isBeta: true,
    });
  }

  return Response.json({ ok: true, session: row });
}

export async function GET(request: Request): Promise<Response> {
  await auth();
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId) {
    return Response.json({ error: "sessionId required" }, { status: 400 });
  }
  const session = getBetaSession(sessionId);
  if (!session) {
    return Response.json({ error: "not found" }, { status: 404 });
  }
  return Response.json({ session });
}
