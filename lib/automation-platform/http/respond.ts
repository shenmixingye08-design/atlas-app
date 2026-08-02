import {
  AutomationPlatformError,
  getAutomationErrorPresentation,
} from "@/lib/automation-platform/errors/messages";
import type { AutomationErrorCode } from "@/lib/automation-platform/errors/codes";
import { appendAutomationAudit } from "@/lib/automation-platform/audit/log";

export function jsonError(
  error: unknown,
  audit?: {
    actorUserId: string | null;
    action: string;
    automationId?: string | null;
    runId?: string | null;
  },
): Response {
  if (error instanceof AutomationPlatformError) {
    if (audit) {
      appendAutomationAudit({
        actorUserId: audit.actorUserId,
        action: audit.action,
        automationId: audit.automationId ?? null,
        runId: audit.runId ?? null,
        outcome: error.code === "automation_permission_denied" ||
          error.code === "automation_unauthorized"
          ? "denied"
          : "error",
        errorCode: error.code,
        meta: error.details ?? {},
      });
    }
    return Response.json(error.toJSON(), { status: error.httpStatus });
  }

  const presentation = getAutomationErrorPresentation(
    "automation_run_failed" satisfies AutomationErrorCode,
  );
  if (audit) {
    appendAutomationAudit({
      actorUserId: audit.actorUserId,
      action: audit.action,
      automationId: audit.automationId ?? null,
      runId: audit.runId ?? null,
      outcome: "error",
      errorCode: presentation.code,
      meta: {
        message: error instanceof Error ? error.message : "unknown",
      },
    });
  }
  return Response.json(
    {
      error: {
        code: presentation.code,
        message: presentation.userMessage,
      },
    },
    { status: 500 },
  );
}
