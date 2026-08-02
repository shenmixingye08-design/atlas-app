import { AutomationPlatformError } from "@/lib/automation-platform/errors/messages";
import { jsonError } from "@/lib/automation-platform/http/respond";
import type { RunSearchFilters } from "@/lib/automation-platform/history/search";
import type { RunSortKey } from "@/lib/automation-platform/history/search";
import { automationPlatformService } from "@/lib/automation-platform/service/automation-service";
import type { AutomationRunStatus } from "@/lib/automation-platform/types/status";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { auth } from "@clerk/nextjs/server";

const RUN_STATUSES: ReadonlySet<string> = new Set([
  "scheduled",
  "preparing",
  "awaiting_approval",
  "queued",
  "running",
  "retrying",
  "needs_input",
  "succeeded",
  "partially_succeeded",
  "failed",
  "skipped",
  "cancelled",
  "expired",
]);

function parseStatuses(raw: string | null): AutomationRunStatus[] | undefined {
  if (!raw) return undefined;
  const parts = raw
    .split(",")
    .map((part) => part.trim())
    .filter((part) => RUN_STATUSES.has(part)) as AutomationRunStatus[];
  return parts.length > 0 ? parts : undefined;
}

export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return jsonError(new AutomationPlatformError("automation_unauthorized"), {
      actorUserId: null,
      action: "automation.runs.search",
    });
  }

  try {
    const access = await resolveFeatureAccessContext();
    const url = new URL(request.url);
    const filters: RunSearchFilters = {
      query: url.searchParams.get("q") ?? undefined,
      statuses: parseStatuses(url.searchParams.get("status")),
      automationId: url.searchParams.get("automationId") ?? undefined,
      diagnosticId: url.searchParams.get("diagnosticId") ?? undefined,
      from: url.searchParams.get("from") ?? undefined,
      to: url.searchParams.get("to") ?? undefined,
      needsUserInput:
        url.searchParams.get("needsInput") === "1" ? true : undefined,
      retryable: url.searchParams.get("retryable") === "1" ? true : undefined,
      hasArtifacts:
        url.searchParams.get("hasArtifacts") === "1" ? true : undefined,
      hasExternalAction:
        url.searchParams.get("hasExternal") === "1" ? true : undefined,
      hasRetry: url.searchParams.get("hasRetry") === "1" ? true : undefined,
    };
    const sort = (url.searchParams.get("sort") ?? "newest") as RunSortKey;
    const runs = await automationPlatformService.searchRuns(
      userId,
      access,
      filters,
      sort,
    );
    return Response.json({ runs });
  } catch (error) {
    return jsonError(error, {
      actorUserId: userId,
      action: "automation.runs.search",
    });
  }
}
