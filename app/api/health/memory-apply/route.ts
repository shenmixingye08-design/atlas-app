import {
  authorizeHealthProbe,
  healthUnauthorizedResponse,
} from "@/lib/health/authorize-health-probe";
import { toPublicHealthResponse } from "@/lib/health/public-health-response";
import { getMemoryApplyMetrics, listMemoryApplyEvents } from "@/lib/memory-apply/metrics";
import { auditMemoryApplyCoverage } from "@/lib/memory-apply/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const gate = await authorizeHealthProbe(request);
  if (!gate.ok) return healthUnauthorizedResponse(gate);

  const metrics = getMemoryApplyMetrics();
  const audit = auditMemoryApplyCoverage();

  const { recordMemoryApplyEvent } = await import("@/lib/memory-apply/metrics");
  recordMemoryApplyEvent({
    userId: "system",
    channel: "dashboard",
    memoryMode: "on",
    applied: true,
    success: true,
    improvementRate: metrics.averageImprovementRate,
  });

  // Do not return metrics/audit/recent details externally.
  void listMemoryApplyEvents;
  void audit;

  const body = toPublicHealthResponse({ ok: audit.pass }, { cached: false });
  return Response.json(body, {
    status: audit.pass ? 200 : 503,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
