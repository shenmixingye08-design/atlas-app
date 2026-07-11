import type { CreateAutomationInput } from "@/lib/automations/types";
import { automationService } from "@/lib/automations/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { validateAutomationFeatureAccess } from "@/lib/feature-flags/guards";
import { auth } from "@clerk/nextjs/server";

function parseCreateBody(body: unknown): CreateAutomationInput | { error: string } {
  if (typeof body !== "object" || body === null) {
    return { error: "Request body must be an object" };
  }

  const record = body as Record<string, unknown>;

  if (typeof record.name !== "string" || !record.name.trim()) {
    return { error: "name is required" };
  }

  if (typeof record.description !== "string") {
    return { error: "description is required" };
  }

  if (typeof record.schedule !== "object" || record.schedule === null) {
    return { error: "schedule is required" };
  }

  if (typeof record.workflow !== "object" || record.workflow === null) {
    return { error: "workflow is required" };
  }

  const workflow = record.workflow as Record<string, unknown>;
  if (typeof workflow.assignment !== "string" || !workflow.assignment.trim()) {
    return { error: "workflow.assignment is required" };
  }

  return {
    name: record.name.trim(),
    description: record.description.trim(),
    schedule: record.schedule as CreateAutomationInput["schedule"],
    workflow: {
      assignment: workflow.assignment.trim(),
      ...(workflow.metadata !== undefined && {
        metadata: workflow.metadata as Record<string, unknown>,
      }),
    },
    ...(typeof record.timing === "object" && record.timing !== null
      ? { timing: record.timing as CreateAutomationInput["timing"] }
      : {}),
    ...(typeof record.executionLevel === "string"
      ? { executionLevel: record.executionLevel as CreateAutomationInput["executionLevel"] }
      : {}),
    ...(typeof record.executionMode === "string"
      ? { executionMode: record.executionMode as CreateAutomationInput["executionMode"] }
      : {}),
    ...(record.snsBatchDays === 7 || record.snsBatchDays === 30
      ? { snsBatchDays: record.snsBatchDays as CreateAutomationInput["snsBatchDays"] }
      : record.snsBatchDays === null
        ? { snsBatchDays: null }
        : {}),
    ...(typeof record.executionFlow === "object" && record.executionFlow !== null
      ? { executionFlow: record.executionFlow as CreateAutomationInput["executionFlow"] }
      : {}),
    ...(typeof record.enabled === "boolean" ? { enabled: record.enabled } : {}),
  };
}

export async function GET(): Promise<Response> {
  const automations = await automationService.list();
  return Response.json(automations);
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = parseCreateBody(body);
  if ("error" in parsed) {
    return Response.json({ error: parsed.error }, { status: 400 });
  }

  const accessContext = await resolveFeatureAccessContext();
  const featureError = validateAutomationFeatureAccess(parsed, accessContext);
  if (featureError) {
    return Response.json({ error: featureError }, { status: 403 });
  }

  const {
    requireBillingAutomationTask,
    requireBillingFeature,
  } = await import("@/lib/billing/access");

  const existing = await automationService.list();
  const taskDenied = await requireBillingAutomationTask(userId, existing.length);
  if (taskDenied) return taskDenied;

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

  const automation = await automationService.create(parsed);
  return Response.json(automation, { status: 201 });
}
