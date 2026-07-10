import { auth } from "@clerk/nextjs/server";

import { setPendingCancellationReason } from "@/lib/owner/cancellation-analysis/store";
import { parseCancellationReasonId } from "@/lib/owner/cancellation-analysis/telemetry";

type RequestBody = {
  reasonId?: unknown;
};

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await request.json()) as RequestBody;
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const reasonId = parseCancellationReasonId(body.reasonId);
  if (!reasonId) {
    return Response.json({ error: "Invalid cancellation reason" }, { status: 400 });
  }

  setPendingCancellationReason(userId, reasonId);
  return Response.json({ ok: true, reasonId });
}
