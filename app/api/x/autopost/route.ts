import { auth } from "@clerk/nextjs/server";

import { isFeatureEnabled } from "@/lib/feature-flags/access";
import { featureDisabledMessage } from "@/lib/feature-flags/guards";
import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { ensureExternalAuthHydrated } from "@/lib/integrations/external-services/durable";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import { computeNextScheduledFor } from "@/lib/integrations/x/post/autopost-schedule";
import {
  loadXAutoPostSettings,
  saveXAutoPostSettings,
  type XAutoPostSettingsPatch,
} from "@/lib/integrations/x/post/autopost-settings-store";
import { listXAutoPostRuns } from "@/lib/integrations/x/post/autopost-runs-store";
import type { XAutoPostStatusResult } from "@/lib/integrations/x/post/autopost-types";

type RequestBody = {
  enabled?: unknown;
  mode?: unknown;
  purpose?: unknown;
  themes?: unknown;
  audience?: unknown;
  tone?: unknown;
  frequency?: unknown;
  daysOfWeek?: unknown;
  postTimes?: unknown;
  timezone?: unknown;
  includeHashtags?: unknown;
};

async function resolveConnection(userId: string): Promise<{
  connected: boolean;
  username: string | null;
}> {
  try {
    await ensureExternalAuthHydrated(userId);
    const connection = getExternalServiceConnection(userId, "x");
    const username =
      connection.account?.username ??
      connection.account?.email?.replace(/^@/, "") ??
      null;
    return { connected: connection.status === "connected", username };
  } catch {
    return { connected: false, username: null };
  }
}

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const context = await resolveFeatureAccessContext();
  if (!isFeatureEnabled("x", context)) {
    const body: XAutoPostStatusResult = {
      status: "feature_disabled",
      message: featureDisabledMessage("x"),
    };
    return Response.json(body, { status: 403 });
  }

  const [settings, connection, recentRuns] = await Promise.all([
    loadXAutoPostSettings(userId),
    resolveConnection(userId),
    listXAutoPostRuns(userId, 20),
  ]);

  const body: XAutoPostStatusResult = {
    status: "ready",
    settings,
    connected: connection.connected,
    accountUsername: connection.username,
    nextScheduledFor: computeNextScheduledFor(settings),
    recentRuns,
  };
  return Response.json(body);
}

export async function PUT(request: Request): Promise<Response> {
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

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json(
      { status: "error", message: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const patch: XAutoPostSettingsPatch = {};
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (body.mode === "full_auto" || body.mode === "approval") {
    patch.mode = body.mode;
  }
  if (typeof body.purpose === "string") patch.purpose = body.purpose;
  if (Array.isArray(body.themes)) {
    patch.themes = body.themes.filter(
      (item): item is string => typeof item === "string",
    );
  }
  if (typeof body.audience === "string") patch.audience = body.audience;
  if (typeof body.tone === "string") patch.tone = body.tone;
  if (typeof body.frequency === "string") {
    patch.frequency = body.frequency as XAutoPostSettingsPatch["frequency"];
  }
  if (Array.isArray(body.daysOfWeek)) {
    patch.daysOfWeek = body.daysOfWeek
      .map((item) => Number(item))
      .filter((item) => Number.isInteger(item));
  }
  if (Array.isArray(body.postTimes)) {
    patch.postTimes = body.postTimes.filter(
      (item): item is string => typeof item === "string",
    );
  }
  if (typeof body.timezone === "string") patch.timezone = body.timezone;
  if (typeof body.includeHashtags === "boolean") {
    patch.includeHashtags = body.includeHashtags;
  }

  const settings = await saveXAutoPostSettings(userId, patch);

  return Response.json({
    status: "ready",
    settings,
    nextScheduledFor: computeNextScheduledFor(settings),
  });
}
