import { auth } from "@clerk/nextjs/server";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { computeNextScheduledFor } from "@/lib/integrations/x/post/autopost-schedule";
import { loadXAutoPostSettings } from "@/lib/integrations/x/post/autopost-settings-store";
import { runImmediateAutoPostTrial } from "@/lib/integrations/x/post/autopost-trial";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();
  if (!isFeatureEnabled("x", context)) {
    return Response.json(
      { status: "feature_disabled", message: featureDisabledMessage("x") },
      { status: 403 },
    );
  }

  let body: { confirm?: unknown; overrideText?: unknown };
  try {
    body = (await request.json()) as { confirm?: unknown; overrideText?: unknown };
  } catch {
    return Response.json(
      { status: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  if (body.confirm !== true) {
    return Response.json(
      {
        status: "error",
        reason: "confirm_required",
        message: "この内容で実際に実行する確認が必要です。",
      },
      { status: 400 },
    );
  }

  try {
    await ensureExternalAuthHydrated(userId);
  } catch {
    // Connection check below still runs.
  }

  const connection = getExternalServiceConnection(userId, "x");
  if (connection.status !== "connected") {
    return Response.json(
      {
        status: "x_not_connected",
        message: "まずXを連携してください。",
      },
      { status: 409 },
    );
  }

  const settings = await loadXAutoPostSettings(userId);
  const result = await runImmediateAutoPostTrial({
    userId,
    settings,
    context,
    confirm: true,
    overrideText:
      typeof body.overrideText === "string" ? body.overrideText : null,
  });

  if (result.status === "failed" || result.status === "skipped") {
    const http =
      result.reason === "billing"
        ? 403
        : result.reason === "x_not_connected"
          ? 409
          : 502;
    return Response.json(
      {
        ...result,
        nextScheduledFor: computeNextScheduledFor(settings),
      },
      { status: http },
    );
  }

  return Response.json({
    ...result,
    nextScheduledFor: computeNextScheduledFor(settings),
  });
}
