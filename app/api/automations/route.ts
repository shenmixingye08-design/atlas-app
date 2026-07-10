import type { CreateAutomationInput } from "@/lib/automations/types";
import { automationService } from "@/lib/automations/automation-service";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { validateAutomationFeatureAccess } from "@/lib/feature-flags/guards";

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

  const automation = await automationService.create(parsed);
  return Response.json(automation, { status: 201 });
}
