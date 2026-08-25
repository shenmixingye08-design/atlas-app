import { auth } from "@clerk/nextjs/server";

import { updateDeliverableBatchItem } from "@/lib/deliverable-batch/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PATCH(
  request: Request,
  context: { params: Promise<{ id: string; itemId: string }> },
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }
  const { itemId } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  delete body.userId;
  const item = await updateDeliverableBatchItem(userId, itemId, {
    title: typeof body.title === "string" ? body.title.slice(0, 80) : undefined,
    individualInstruction:
      typeof body.individualInstruction === "string"
        ? body.individualInstruction.slice(0, 400)
        : undefined,
    fileName: typeof body.fileName === "string" ? body.fileName.slice(0, 80) : undefined,
    sourceContent:
      typeof body.sourceContent === "string" ? body.sourceContent.slice(0, 20_000) : undefined,
    status:
      body.status === "approved" || body.status === "ready" || body.status === "cancelled"
        ? body.status
        : undefined,
  });
  if (!item) {
    return Response.json({ error: "項目が見つかりません。" }, { status: 404 });
  }
  return Response.json({ item });
}
