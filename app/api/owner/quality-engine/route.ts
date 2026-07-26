import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { listQualityEngineTelemetry } from "@/lib/quality-engine";

export const dynamic = "force-dynamic";

/** Owner-only Quality Engine logs: timings, improve count, score. */
export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const limitRaw = new URL(request.url).searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;
  return Response.json({
    entries: listQualityEngineTelemetry(
      Number.isFinite(limit) ? limit : 100,
    ),
  });
}
