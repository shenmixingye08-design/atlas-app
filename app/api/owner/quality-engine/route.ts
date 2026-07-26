import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  buildQualityKindStats,
  listQualityEngineTelemetry,
} from "@/lib/quality-engine";
import { listSecretaryIntelligence } from "@/lib/secretary-intelligence";

export const dynamic = "force-dynamic";

/** Owner-only Quality Engine logs + per-kind quality stats + Secretary Intelligence. */
export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const limitRaw = new URL(request.url).searchParams.get("limit");
  const limit = limitRaw ? Number.parseInt(limitRaw, 10) : 100;
  const safeLimit = Number.isFinite(limit) ? limit : 100;
  const entries = listQualityEngineTelemetry(safeLimit);
  return Response.json({
    entries,
    byKind: buildQualityKindStats(entries),
    secretaryIntelligence: listSecretaryIntelligence(safeLimit),
  });
}
