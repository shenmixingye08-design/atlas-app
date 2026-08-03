import { auth } from "@clerk/nextjs/server";

import { automationService } from "@/lib/automations/automation-service";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function resolveOrigin(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";

  if (host) {
    return `${protocol}://${host}`;
  }

  return new URL(request.url).origin;
}

export async function POST(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const automation = await automationService.getByIdForUser(id, userId);

  if (!automation) {
    return Response.json({ error: "Automation not found" }, { status: 404 });
  }

  if (automation.status === "running") {
    return Response.json(
      { error: "Automation is already running" },
      { status: 409 },
    );
  }

  const origin = resolveOrigin(request);
  const url = new URL(request.url);
  // sync=1 keeps legacy in-request execution for internal tests only.
  // Default path: durable enqueue — worker executes under lease.
  const forceSync =
    url.searchParams.get("sync") === "1" ||
    process.env.ATLAS_RUN_SYNC?.trim() === "1";

  const { requireBillingAiUsage, requireBillingFeature } = await import(
    "@/lib/billing/access"
  );
  if (automation.executionMode === "high_quality") {
    const hqDenied = await requireBillingFeature(userId, "high_quality_mode");
    if (hqDenied) return hqDenied;
  }
  const usageDenied = await requireBillingAiUsage(userId);
  if (usageDenied) return usageDenied;

  const { recordAuditLogSafe, auditRequestContext } = await import(
    "@/lib/owner/audit-log"
  );
  const ctx = auditRequestContext(request);

  if (!forceSync) {
    const { enqueueManualAutomationRun } = await import(
      "@/lib/work-queue/enqueue-manual"
    );
    const { job, created } = await enqueueManualAutomationRun({
      automationId: id,
      ownerId: userId,
      automationName: automation.name,
      assignment: automation.workflow?.assignment,
      requestOrigin: origin,
      offlineArtifacts: false,
    });
    recordAuditLogSafe({
      userId,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
      category: "automation",
      action: "automation_run",
      targetId: id,
      result: "success",
      reason: created ? "manual run enqueued" : "manual run deduped",
    });
    return Response.json(
      {
        automationId: id,
        workflowRunId: job.runId,
        status: "queued",
        orchestrationStatus: "queued",
        approved: true,
        totalDurationMs: 0,
        finalResponsePreview: null,
        error: null,
        deliverableCount: 0,
        jobId: job.jobId,
        occurrenceKey: job.occurrenceKey,
        dedupeSkipped: !created,
        message: "仕事をキューに入れました。Worker が実行します。",
      },
      { status: 202 },
    );
  }

  const result = await automationService.runNow(id, {
    requestOrigin: origin,
    userId,
  });

  if (!result) {
    return Response.json({ error: "Automation not found" }, { status: 404 });
  }

  recordAuditLogSafe({
    userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    category: "automation",
    action: "automation_run",
    targetId: id,
    result: result.status === "failed" ? "failure" : "success",
    reason: result.status === "failed" ? result.error ?? "run failed" : "manual run sync",
  });

  if (result.status === "failed") {
    return Response.json(result, { status: 500 });
  }

  return Response.json(result);
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const automation = await automationService.getByIdForUser(id, userId);
  if (!automation) {
    return Response.json({ error: "Automation not found" }, { status: 404 });
  }

  const runs = await automationService.listWorkflowRuns(id);
  return Response.json({ runs });
}
