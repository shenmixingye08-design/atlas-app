import { auth } from "@clerk/nextjs/server";

import { createDeliverableBatchZip } from "@/lib/deliverable-batch/zip";
import { notifyDeliverableBatch } from "@/lib/deliverable-batch/notify";
import { getDeliverableBatchView } from "@/lib/deliverable-batch/service";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }
  const { id } = await context.params;
  const view = await getDeliverableBatchView(userId, id);
  if (!view) {
    return Response.json({ error: "見つかりません。" }, { status: 404 });
  }
  const successOnly = new URL(request.url).searchParams.get("successOnly") === "1";
  const files: Array<{ itemId: string; fileName: string; data: Uint8Array }> = [];
  for (const item of view.items) {
    if (!item.outputArtifactId) continue;
    if (successOnly && item.status !== "ready" && item.status !== "approved") continue;
    const stored = await getStoredDeliverableForUser(item.outputArtifactId, userId);
    if (!stored || stored.buffer.byteLength <= 0) continue;
    files.push({
      itemId: item.id,
      fileName: item.fileName || stored.fileName,
      data: new Uint8Array(stored.buffer),
    });
  }
  if (files.length === 0) {
    return Response.json({ error: "ダウンロードできる成果物がまだありません。" }, { status: 409 });
  }
  const zip = createDeliverableBatchZip({
    batch: view.batch,
    items: view.items,
    files,
  });
  await notifyDeliverableBatch(userId, "zip", id, view.batch.name);
  return new Response(Buffer.from(zip), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="batch.zip"`,
    },
  });
}
