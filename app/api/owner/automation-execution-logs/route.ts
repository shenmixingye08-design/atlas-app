import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  getAutomationCronDebugSnapshot,
  listAutomationExecutionLogs,
} from "@/lib/automations/execution-log";

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();

  const url = new URL(request.url);
  const automationId = url.searchParams.get("automationId") ?? undefined;
  const logs = listAutomationExecutionLogs({
    automationId: automationId ?? undefined,
    limit: 100,
  });
  const cron = getAutomationCronDebugSnapshot();

  return Response.json({
    cron,
    logs: logs.map((row) => ({
      id: row.id,
      automationId: row.automationId,
      userId: row.userId,
      scheduledAt: row.scheduledAt,
      startedAt: row.startedAt,
      completedAt: row.completedAt,
      status: row.status,
      generatedText: row.generatedText,
      xPostId: row.xPostId,
      xPostUrl: row.xPostUrl,
      errorCode: row.errorCode,
      errorMessage: row.errorMessage,
      retryCount: row.retryCount,
      xApiSummary: row.xApiSummary,
      triggerType: row.triggerType,
    })),
  });
}
