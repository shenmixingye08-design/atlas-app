import { automationService } from "@/lib/automations/automation-service";
import type { UpdateAutomationInput } from "@/lib/automations/types";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { validateAutomationFeatureAccess } from "@/lib/feature-flags/guards";

type RouteContext = {
  params: Promise<{ id: string }>;
};

function parsePatchBody(body: unknown): UpdateAutomationInput | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be an object" };
  }

  const record = body as Record<string, unknown>;
  const patch: UpdateAutomationInput = {};

  if (record.name !== undefined) {
    if (typeof record.name !== "string" || !record.name.trim()) {
      return { error: "name must be a non-empty string" };
    }
    patch.name = record.name.trim();
  }

  if (record.description !== undefined) {
    if (typeof record.description !== "string") {
      return { error: "description must be a string" };
    }
    patch.description = record.description.trim();
  }

  if (record.enabled !== undefined) {
    if (typeof record.enabled !== "boolean") {
      return { error: "enabled must be a boolean" };
    }
    patch.enabled = record.enabled;
  }

  if (record.schedule !== undefined) {
    if (typeof record.schedule !== "object" || record.schedule === null) {
      return { error: "schedule must be an object" };
    }
    patch.schedule = record.schedule as UpdateAutomationInput["schedule"];
  }

  if (record.workflow !== undefined) {
    if (typeof record.workflow !== "object" || record.workflow === null) {
      return { error: "workflow must be an object" };
    }
    patch.workflow = record.workflow as UpdateAutomationInput["workflow"];
  }

  if (record.timing !== undefined) {
    if (typeof record.timing !== "object" || record.timing === null) {
      return { error: "timing must be an object" };
    }
    patch.timing = record.timing as UpdateAutomationInput["timing"];
  }

  if (record.executionLevel !== undefined) {
    const level = record.executionLevel;
    if (
      level !== "suggest_only" &&
      level !== "draft_save" &&
      level !== "approve_then_run" &&
      level !== "full_auto"
    ) {
      return { error: "executionLevel is invalid" };
    }
    patch.executionLevel = level;
  }

  if (record.executionMode !== undefined) {
    const mode = record.executionMode;
    if (mode !== "eco" && mode !== "standard" && mode !== "high_quality") {
      return { error: "executionMode is invalid" };
    }
    patch.executionMode = mode;
  }

  if (record.snsBatchDays !== undefined) {
    if (record.snsBatchDays !== null && record.snsBatchDays !== 7 && record.snsBatchDays !== 30) {
      return { error: "snsBatchDays must be 7, 30, or null" };
    }
    patch.snsBatchDays = record.snsBatchDays as UpdateAutomationInput["snsBatchDays"];
  }

  if (record.executionFlow !== undefined) {
    if (typeof record.executionFlow !== "object" || record.executionFlow === null) {
      return { error: "executionFlow must be an object" };
    }
    patch.executionFlow = record.executionFlow as UpdateAutomationInput["executionFlow"];
  }

  if (Object.keys(patch).length === 0) {
    return { error: "No valid fields to update" };
  }

  return patch;
}

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const automation = await automationService.getByIdForUser(id, userId);

  if (!automation) {
    return Response.json({ error: "Automation not found" }, { status: 404 });
  }

  return Response.json(automation);
}

export async function PATCH(
  request: Request,
  context: RouteContext,
): Promise<Response> {
  const { auth } = await import("@clerk/nextjs/server");
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parsePatchBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const accessContext = await resolveFeatureAccessContext();
  const featureError = validateAutomationFeatureAccess(parsed, accessContext);
  if (featureError) {
    return Response.json({ error: featureError }, { status: 403 });
  }

  const { requireBillingFeature } = await import("@/lib/billing/access");
  if (parsed.executionMode === "high_quality") {
    const hqDenied = await requireBillingFeature(userId, "high_quality_mode");
    if (hqDenied) return hqDenied;
  }
  if (parsed.executionMode === "eco") {
    const ecoDenied = await requireBillingFeature(userId, "eco_mode");
    if (ecoDenied) return ecoDenied;
  }
  const templateId = parsed.executionFlow?.templateId;
  if (templateId === "sns_post") {
    const snsDenied = await requireBillingFeature(userId, "sns_auto_post");
    if (snsDenied) return snsDenied;
  }
  if (templateId === "blog") {
    const blogDenied = await requireBillingFeature(userId, "blog_creation");
    if (blogDenied) return blogDenied;
  }
  if (templateId === "video") {
    const videoDenied = await requireBillingFeature(userId, "video_generation");
    if (videoDenied) return videoDenied;
  }

  const updated = await automationService.updateForUser(id, userId, parsed);
  if (!updated) {
    return Response.json({ error: "Automation not found" }, { status: 404 });
  }

  const { recordAuditLogSafe, auditRequestContext } = await import(
    "@/lib/owner/audit-log"
  );
  const ctx = auditRequestContext(request);
  const action =
    parsed.enabled === false
      ? "automation_disable"
      : "automation_update";
  recordAuditLogSafe({
    userId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
    category: "automation",
    action,
    targetId: updated.id,
    result: "success",
    reason:
      parsed.enabled === false
        ? "Automation disabled"
        : "Automation updated",
  });

  return Response.json(updated);
}
