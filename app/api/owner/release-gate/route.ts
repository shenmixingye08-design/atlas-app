import { auth } from "@clerk/nextjs/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { auditPastPhases, buildReleaseFindings } from "@/lib/release-gate/evidence-audit";
import {
  listCapabilityFlags,
  listCapabilityFlagAudit,
  setCapabilityFlag,
  type CapabilityFlagState,
} from "@/lib/release-gate/capability-flags";
import {
  listKillSwitches,
  listKillSwitchAudit,
  setKillSwitch,
} from "@/lib/release-gate/kill-switch";
import { decidePublishScope } from "@/lib/release-gate/publish-scope";
import { RELEASE_GATE_ALERTS, alertSla } from "@/lib/release-gate/monitoring";
import { RELEASE_GATE_RUNBOOKS } from "@/lib/release-gate/runbooks";
import { getPublicStatusComponents, listPublicIncidents, upsertPublicIncident } from "@/lib/release-gate/status-components";
import type { CapabilityId, KillSwitchId } from "@/lib/release-gate/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CAPABILITY_STATES = new Set(["on", "off", "beta", "invite"]);
const DUAL_CONTROL_SWITCHES = new Set<KillSwitchId>([
  "external_all",
  "billing",
  "openai_all",
]);

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();

  const url = new URL(request.url);
  const requestId = url.searchParams.get("requestId")?.trim() || null;
  const jobId = url.searchParams.get("jobId")?.trim() || null;
  const artifactId = url.searchParams.get("artifactId")?.trim() || null;
  const userId = url.searchParams.get("userId")?.trim() || null;
  const externalActionId =
    url.searchParams.get("externalActionId")?.trim() || null;

  const phases = auditPastPhases();
  const findings = buildReleaseFindings(phases);

  return Response.json({
    generatedAt: new Date().toISOString(),
    releaseReady: false,
    note: "成果物本文は表示しません。ID検索はメタデータ参照のみ。",
    phases,
    findings,
    publishScope: decidePublishScope(),
    capabilityFlags: listCapabilityFlags(),
    capabilityAudit: listCapabilityFlagAudit(50),
    killSwitches: listKillSwitches(),
    killAudit: listKillSwitchAudit(50),
    alerts: RELEASE_GATE_ALERTS.map((a) => ({
      ...a,
      sla: alertSla(a.severity),
    })),
    runbooks: RELEASE_GATE_RUNBOOKS.map((r) => ({
      id: r.id,
      title: r.title,
      detect: r.detect,
      firstResponse: r.firstResponse,
      stopTargets: r.stopTargets,
    })),
    statusComponents: getPublicStatusComponents(),
    incidents: listPublicIncidents(20),
    search: {
      requestId,
      jobId,
      artifactId,
      userId,
      externalActionId,
      result:
        requestId || jobId || artifactId || userId || externalActionId
          ? {
              matched: false,
              message:
                "メタデータ索引への接続は運用DB前提。本文は返却しません。request_id がある場合はログ基盤で検索してください。",
            }
          : null,
    },
    criticalOpen: findings.filter(
      (f) => f.severity === "Critical" && f.status === "open"
    ).length,
  });
}

export async function PATCH(request: Request): Promise<Response> {
  const owner = await requireAtlasOwner();
  const { userId } = await auth();

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return Response.json({ error: "Invalid body" }, { status: 400 });
  }

  const action = (body as { action?: unknown }).action;
  const reason =
    typeof (body as { reason?: unknown }).reason === "string"
      ? (body as { reason: string }).reason.trim()
      : "";

  if (!reason || reason.length < 3) {
    return Response.json(
      { error: "reason is required (min 3 chars)" },
      { status: 400 }
    );
  }

  const actor = owner.email ?? userId ?? "owner";

  if (action === "set_capability") {
    const id = (body as { id?: unknown }).id;
    const state = (body as { state?: unknown }).state;
    if (typeof id !== "string" || typeof state !== "string") {
      return Response.json({ error: "id and state required" }, { status: 400 });
    }
    if (!CAPABILITY_STATES.has(state)) {
      return Response.json({ error: "invalid state" }, { status: 400 });
    }
    const record = setCapabilityFlag({
      id: id as CapabilityId,
      state: state as CapabilityFlagState,
      actor,
      reason,
    });
    await audit(request, owner.email, userId, `capability ${id} → ${state}`, reason);
    return Response.json({
      ok: true,
      record,
      effectiveWithin: "immediate (process memory; restart resets unless persisted)",
    });
  }

  if (action === "set_kill_switch") {
    const id = (body as { id?: unknown }).id;
    const engaged = (body as { engaged?: unknown }).engaged;
    const confirm = (body as { confirm?: unknown }).confirm;
    if (typeof id !== "string" || typeof engaged !== "boolean") {
      return Response.json(
        { error: "id and engaged required" },
        { status: 400 }
      );
    }
    if (
      engaged &&
      DUAL_CONTROL_SWITCHES.has(id as KillSwitchId) &&
      confirm !== "ENGAGE"
    ) {
      return Response.json(
        {
          error: "dual_control_required",
          message:
            "重大Kill Switchの有効化には confirm=ENGAGE と理由が必要です（二者承認運用を推奨）。",
        },
        { status: 400 }
      );
    }
    const record = setKillSwitch({
      id: id as KillSwitchId,
      engaged,
      reason,
      actor,
    });
    await audit(
      request,
      owner.email,
      userId,
      `kill_switch ${id} → ${engaged}`,
      reason
    );
    return Response.json({
      ok: true,
      record,
      effectiveWithin: "immediate",
      inFlightJobsPolicy:
        "新規実行は拒否。実行中ジョブは完了待ち。強制中断が必要な場合は worker 停止 Runbook へ。",
    });
  }

  if (action === "set_incident") {
    const id = (body as { id?: unknown }).id;
    const title = (body as { title?: unknown }).title;
    const phase = (body as { phase?: unknown }).phase;
    const publicNote = (body as { publicNote?: unknown }).publicNote;
    if (
      typeof id !== "string" ||
      typeof title !== "string" ||
      typeof phase !== "string"
    ) {
      return Response.json(
        { error: "id, title, phase required" },
        { status: 400 }
      );
    }
    const incident = upsertPublicIncident({
      id,
      title,
      phase: phase as "investigating",
      components: Array.isArray((body as { components?: unknown }).components)
        ? ((body as { components: string[] }).components as never)
        : ["web_app"],
      publicNote:
        typeof publicNote === "string" ? publicNote : reason,
    });
    await audit(request, owner.email, userId, `incident ${id} → ${phase}`, reason);
    return Response.json({ ok: true, incident });
  }

  return Response.json({ error: "unknown action" }, { status: 400 });
}

async function audit(
  request: Request,
  email: string | null,
  userId: string | null | undefined,
  actionLabel: string,
  reason: string
): Promise<void> {
  try {
    const { recordAuditLogSafe, auditRequestContext } = await import(
      "@/lib/owner/audit-log"
    );
    const ctx = auditRequestContext(request);
    recordAuditLogSafe({
      userId: userId ?? null,
      email,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "owner",
      action: "owner_action",
      targetId: "release-gate",
      result: "success",
      reason: `${actionLabel}: ${reason}`,
    });
  } catch {
    // non-blocking
  }
}
