import { handleAutomationNaturalLanguage } from "@/lib/automations/handle-natural-language.server";
import { auth } from "@clerk/nextjs/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Phase 1: Chat / Commander NL → durable active automation.
 * Success body only when schedule + nextRun persisted.
 */
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

  const text =
    typeof body === "object" &&
    body !== null &&
    typeof (body as { text?: unknown }).text === "string"
      ? (body as { text: string }).text
      : "";

  const result = await handleAutomationNaturalLanguage({
    userId,
    text,
  });

  if (!result.ok) {
    return Response.json(
      {
        ok: false,
        error: result.message,
        code: result.code,
      },
      { status: result.httpStatus },
    );
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
    action: "automation_create_from_nl",
    targetId: result.automation?.id,
    result: "success",
    reason: result.automation?.name ?? result.code ?? "automation_nl",
  });

  return Response.json(
    {
      ok: true,
      message: result.message,
      frequency: result.frequency,
      automation: result.automation
        ? {
            id: result.automation.id,
            name: result.automation.name,
            enabled: result.automation.enabled,
            status: result.automation.status,
            schedule: result.automation.schedule,
            nextRun: result.automation.nextRun,
            timezone:
              result.automation.schedule.kind === "schedule"
                ? result.automation.schedule.timezone
                : null,
            executionLevel: result.automation.executionLevel,
          }
        : null,
    },
    { status: 201 },
  );
}
