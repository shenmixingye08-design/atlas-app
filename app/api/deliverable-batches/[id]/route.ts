import { auth } from "@clerk/nextjs/server";

import { getDeliverableBatchView } from "@/lib/deliverable-batch/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "確認が必要です。" }, { status: 401 });
  }
  const { id } = await context.params;
  const view = await getDeliverableBatchView(userId, id);
  if (!view) {
    return Response.json({ error: "まとめて作成が見つかりません。" }, { status: 404 });
  }
  return Response.json(view);
}
