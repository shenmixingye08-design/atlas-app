import { auth } from "@clerk/nextjs/server";

import { mapXPostBatchResult } from "@/lib/integrations/x/post/batch-http";
import {
  cancelOwnedXPostBatch,
  getOwnedXPostBatch,
} from "@/lib/integrations/x/post/batch-service";

export const runtime = "nodejs";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "ログインしてください。" },
      { status: 401 },
    );
  }
  const { id } = await context.params;
  const result = await getOwnedXPostBatch({ ownerId: userId, batchId: id });
  return mapXPostBatchResult(result);
}

export async function DELETE(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "ログインしてください。" },
      { status: 401 },
    );
  }
  const { id } = await context.params;
  const result = await cancelOwnedXPostBatch({ ownerId: userId, batchId: id });
  return mapXPostBatchResult(result);
}
