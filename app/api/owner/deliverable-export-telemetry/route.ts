import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { listExportTelemetry } from "@/lib/deliverables/export";

export const dynamic = "force-dynamic";

/** Owner-only export quality telemetry (normalization / Word / PDF validation). */
export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const url = new URL(request.url);
  const limit = Math.min(Number(url.searchParams.get("limit") ?? "100") || 100, 500);
  return Response.json({ entries: listExportTelemetry(limit) });
}
