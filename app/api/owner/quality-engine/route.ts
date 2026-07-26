import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  buildQualityKindStats,
  listQualityEngineTelemetry,
} from "@/lib/quality-engine";

export const dynamic = "force-dynamic";

/** Owner-only Quality Engine logs + per-kind quality stats. */
export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const limitRaw = new URL(request.url).searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;
  const entries = listQualityEngineTelemetry(
    Number.isFinite(limit) ? limit : 100,
  );
  return Response.json({
    entries,
    byKind: buildQualityKindStats(entries),
  });
}
