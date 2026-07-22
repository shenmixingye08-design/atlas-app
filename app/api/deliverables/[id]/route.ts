import { getStoredDeliverable } from "@/lib/deliverables/store";
import { buildContentDisposition } from "@/lib/deliverables/http-headers";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { id } = await context.params;
  const stored = getStoredDeliverable(id);

  if (!stored) {
    return Response.json(
      {
        error: "Deliverable not found or expired",
        cause:
          "サーバーレス環境では一時保存が別インスタンスに渡らないことがあります。Word/PDFは「再試行」またはエクスポートAPIをご利用ください。",
      },
      { status: 404 },
    );
  }

  if (!stored.buffer || stored.buffer.byteLength < 1) {
    console.error("[Atlas /api/deliverables/:id] empty buffer", {
      id,
      format: stored.format,
    });
    return Response.json(
      { error: "Deliverable file is empty", cause: "buffer size is 0" },
      { status: 500 },
    );
  }

  return new Response(new Uint8Array(stored.buffer), {
    status: 200,
    headers: {
      "Content-Type": stored.mimeType,
      "Content-Disposition": buildContentDisposition(stored.fileName),
      "Content-Length": String(stored.buffer.byteLength),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
