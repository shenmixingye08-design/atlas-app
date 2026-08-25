import { auth } from "@clerk/nextjs/server";

import { notifyDeliverableBatch } from "@/lib/deliverable-batch/notify";
import {
  cancelDeliverableBatch,
  cloneDeliverableBatch,
  deleteDeliverableBatchItems,
  generateDeliverableBatchRemaining,
  generateDeliverableBatchSample,
  regenerateSelectedDeliverableBatchItems,
  retryFailedDeliverableBatchItems,
  updateDeliverableBatchItem,
} from "@/lib/deliverable-batch/service";
import { listDeliverableBatchItems } from "@/lib/deliverable-batch/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function originOf(request: Request): string {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  return host ? `${protocol}://${host}` : new URL(request.url).origin;
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }
  const { id } = await context.params;
  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    body = {};
  }
  const action = typeof body.action === "string" ? body.action : "";
  const origin = originOf(request);

  if (action === "sample") {
    const view = await generateDeliverableBatchSample(userId, id, origin);
    if (!view) return Response.json({ error: "見つかりません。" }, { status: 404 });
    if (view.items[0]?.status === "ready") {
      await notifyDeliverableBatch(userId, "sample", id, view.batch.name);
    }
    return Response.json(view);
  }
  if (action === "generate_remaining") {
    const view = await generateDeliverableBatchRemaining(userId, id, origin, {
      approveSample: body.approveSample === true,
      styleNote: typeof body.styleNote === "string" ? body.styleNote : undefined,
      applyStyleCandidate: body.applyStyleCandidate === true,
    });
    if (!view) return Response.json({ error: "見つかりません。" }, { status: 404 });
    if (view.batch.status === "partially_failed") {
      await notifyDeliverableBatch(userId, "partial", id, view.batch.name);
    } else if (view.batch.status === "ready" || view.batch.status === "completed") {
      await notifyDeliverableBatch(userId, "completed", id, view.batch.name);
    }
    return Response.json(view);
  }
  if (action === "retry_failed") {
    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.filter((value): value is string => typeof value === "string")
      : undefined;
    const view = await retryFailedDeliverableBatchItems(userId, id, origin, itemIds);
    if (!view) return Response.json({ error: "見つかりません。" }, { status: 404 });
    return Response.json(view);
  }
  if (action === "cancel") {
    const view = await cancelDeliverableBatch(userId, id);
    if (!view) return Response.json({ error: "見つかりません。" }, { status: 404 });
    return Response.json(view);
  }
  if (action === "clone") {
    const view = await cloneDeliverableBatch(userId, id);
    if (!view) return Response.json({ error: "複製できませんでした。" }, { status: 400 });
    return Response.json(view);
  }
  if (action === "delete_items") {
    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.filter((value): value is string => typeof value === "string")
      : [];
    const view = await deleteDeliverableBatchItems(userId, id, itemIds);
    if (!view) return Response.json({ error: "見つかりません。" }, { status: 404 });
    return Response.json(view);
  }
  if (action === "regenerate_selected") {
    const itemIds = Array.isArray(body.itemIds)
      ? body.itemIds.filter((value): value is string => typeof value === "string")
      : [];
    const view = await regenerateSelectedDeliverableBatchItems(
      userId,
      id,
      origin,
      itemIds,
    );
    if (!view) return Response.json({ error: "見つかりません。" }, { status: 404 });
    return Response.json(view);
  }
  if (action === "approve_all") {
    const items = listDeliverableBatchItems(userId, id);
    for (const item of items) {
      if (item.status === "ready") {
        await updateDeliverableBatchItem(userId, item.id, { status: "approved" });
      }
    }
    const { getDeliverableBatchView } = await import("@/lib/deliverable-batch/service");
    const view = await getDeliverableBatchView(userId, id);
    if (!view) return Response.json({ error: "見つかりません。" }, { status: 404 });
    return Response.json(view);
  }

  return Response.json({ error: "この操作はできません。" }, { status: 400 });
}
