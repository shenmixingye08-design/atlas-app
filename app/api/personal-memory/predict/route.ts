import { auth } from "@clerk/nextjs/server";

import {
  acceptPredictivePreview,
  acceptProactiveSuggestionForUser,
  dismissProactiveSuggestionForUser,
  getPredictiveMemoryDashboard,
  getPredictivePreviewForUser,
  togglePredictiveMemoryForUser,
} from "@/lib/personal-memory/service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const dashboard = await getPredictiveMemoryDashboard(userId);
    return Response.json({ dashboard });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "predict_dashboard_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      action?: string;
      notes?: string;
      workCategory?: string;
      companyId?: string;
      automationId?: string;
      templateId?: string;
      artifactTypes?: string[];
      disabledMemoryIds?: string[];
      predictionId?: string;
      memoryId?: string;
      enabled?: boolean;
      enabledMemoryIds?: string[];
      fingerprint?: string;
    };

    const action = body.action ?? "predict";

    if (action === "predict") {
      const prediction = await getPredictivePreviewForUser({
        userId,
        notes: body.notes ?? null,
        workCategory: body.workCategory ?? null,
        companyId: body.companyId ?? null,
        automationId: body.automationId ?? null,
        templateId: body.templateId ?? null,
        artifactTypes: body.artifactTypes ?? null,
        disabledMemoryIds: body.disabledMemoryIds ?? null,
      });
      return Response.json({ prediction });
    }

    if (action === "toggle") {
      if (!body.predictionId || !body.memoryId || body.enabled == null) {
        return Response.json({ error: "toggle_params_required" }, { status: 400 });
      }
      const prediction = await togglePredictiveMemoryForUser({
        userId,
        predictionId: body.predictionId,
        memoryId: body.memoryId,
        enabled: body.enabled,
      });
      return Response.json({ prediction });
    }

    if (action === "accept") {
      if (!body.predictionId) {
        return Response.json({ error: "predictionId_required" }, { status: 400 });
      }
      const prediction = await acceptPredictivePreview({
        userId,
        predictionId: body.predictionId,
        enabledMemoryIds: body.enabledMemoryIds,
      });
      return Response.json({ prediction });
    }

    if (action === "dismiss_suggestion") {
      if (!body.fingerprint) {
        return Response.json({ error: "fingerprint_required" }, { status: 400 });
      }
      await dismissProactiveSuggestionForUser(userId, body.fingerprint);
      return Response.json({ ok: true });
    }

    if (action === "accept_suggestion") {
      if (!body.fingerprint) {
        return Response.json({ error: "fingerprint_required" }, { status: 400 });
      }
      await acceptProactiveSuggestionForUser(userId, body.fingerprint);
      return Response.json({ ok: true });
    }

    return Response.json({ error: "unknown_action" }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "predict_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
