import { auth } from "@clerk/nextjs/server";

import {
  getMemoryQualityDashboardForUser,
  learnFromDeliverableDiffWithQuality,
} from "@/lib/personal-memory/service";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const dashboard = await getMemoryQualityDashboardForUser(userId);
    return Response.json({ dashboard });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "quality_dashboard_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}

/** POST: evaluate (and optionally learn) from before/after Diff */
export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json()) as {
      before?: string;
      after?: string;
      automationId?: string;
      artifactType?: string;
      workCategory?: string;
      companyId?: string;
      templateId?: string;
    };
    if (!body.before?.trim() || !body.after?.trim()) {
      return Response.json(
        { error: "before_and_after_required" },
        { status: 400 },
      );
    }
    const { memories, evaluation } = await learnFromDeliverableDiffWithQuality({
      userId,
      before: body.before,
      after: body.after,
      automationId: body.automationId ?? null,
      artifactType: body.artifactType ?? null,
      workCategory: body.workCategory ?? null,
      companyId: body.companyId ?? null,
      templateId: body.templateId ?? null,
    });
    return Response.json({ memories, evaluation });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "quality_evaluate_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
