import { auth } from "@clerk/nextjs/server";

import { buildAttachmentContentDisposition } from "@/lib/http/content-disposition";
import { markDeliverableDownloaded } from "@/lib/deliverables/durable-store";
import { getStoredDeliverableForUser } from "@/lib/deliverables/store";
import { recordReliabilityEvent } from "@/lib/reliability";
import { toHumanReliabilityMessage } from "@/lib/reliability/human-errors";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { error: "確認が必要です。もう一度ログインしてください。" },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  const stored = await getStoredDeliverableForUser(id, userId);

  if (!stored) {
    recordReliabilityEvent("deliverable_download", "failure");
    return Response.json(
      {
        error: toHumanReliabilityMessage("not found or expired"),
      },
      { status: 404 },
    );
  }

  const body = new Uint8Array(stored.buffer);
  if (body.byteLength === 0) {
    recordReliabilityEvent("deliverable_download", "failure");
    return Response.json(
      { error: "成果物を作り直しています。" },
      { status: 500 },
    );
  }

  // Success = user received bytes (download), not merely generation.
  markDeliverableDownloaded(stored.id, userId);
  recordReliabilityEvent("deliverable_download", "success");
  recordReliabilityEvent("deliverable_generate", "success");

  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": stored.mimeType,
      "Content-Disposition": buildAttachmentContentDisposition(stored.fileName),
      "Content-Length": String(body.byteLength),
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
