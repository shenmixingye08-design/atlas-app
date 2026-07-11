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
  const { id } = await context.params;
  const automation = await automationService.getById(id);

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
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { requireBillingAiUsage, requireBillingFeature } = await import(
    "@/lib/billing/access"
  );
  if (automation.executionMode === "high_quality") {
    const hqDenied = await requireBillingFeature(userId, "high_quality_mode");
    if (hqDenied) return hqDenied;
  }
  const usageDenied = await requireBillingAiUsage(userId);
  if (usageDenied) return usageDenied;

  const result = await automationService.runNow(id, {
    requestOrigin: origin,
    userId,
  });

  if (!result) {
    return Response.json({ error: "Automation not found" }, { status: 404 });
  }

  const { recordAuditLogSafe, auditRequestContext } = await import(
    "@/lib/owner/audit-log"
  );
  const ctx = auditRequestContext(request);
  recordAuditLogSafe({
    userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    category: "automation",
    action: "automation_run",
    targetId: id,
    result: result.status === "failed" ? "failure" : "success",
    reason: result.status === "failed" ? result.error ?? "run failed" : "manual run",
  });

  if (result.status === "failed") {
    return Response.json(result, { status: 500 });
  }

  return Response.json(result);
}

export async function GET(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const runs = await automationService.listWorkflowRuns(id);
  return Response.json({ runs });
}
