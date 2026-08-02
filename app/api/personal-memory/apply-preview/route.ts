import { auth } from "@clerk/nextjs/server";

import { getApplyPreviewForContext } from "@/lib/personal-memory/service";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "unauthorized" }, { status: 401 });
  }
  try {
    const body = (await request.json().catch(() => ({}))) as {
      notes?: string;
      workCategory?: string;
      companyId?: string;
      automationId?: string;
      templateId?: string;
      artifactTypes?: string[];
      disabledMemoryIds?: string[];
    };
    const preview = await getApplyPreviewForContext({
      userId,
      notes: body.notes ?? null,
      workCategory: body.workCategory ?? null,
      companyId: body.companyId ?? null,
      automationId: body.automationId ?? null,
      templateId: body.templateId ?? null,
      artifactTypes: body.artifactTypes ?? null,
      disabledMemoryIds: body.disabledMemoryIds ?? null,
    });
    return Response.json({
      items: preview.items,
      injectionText: preview.injectionText,
      prediction: preview.prediction,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "preview_failed";
    return Response.json({ error: message }, { status: 400 });
  }
}
