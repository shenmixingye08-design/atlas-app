import { getMemoryApplyMetrics, listMemoryApplyEvents } from "@/lib/memory-apply/metrics";
import { auditMemoryApplyCoverage } from "@/lib/memory-apply/audit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const metrics = getMemoryApplyMetrics();
  const audit = auditMemoryApplyCoverage();
  const recent = listMemoryApplyEvents().slice(0, 30);

  // Viewing health counts as dashboard channel activity (metrics surface).
  const { recordMemoryApplyEvent } = await import("@/lib/memory-apply/metrics");
  recordMemoryApplyEvent({
    userId: "system",
    channel: "dashboard",
    memoryMode: "on",
    applied: true,
    success: true,
    improvementRate: metrics.averageImprovementRate,
  });

  return Response.json({
    ok: audit.pass,
    metrics: getMemoryApplyMetrics(),
    audit,
    recent,
    checkedAt: new Date().toISOString(),
  });
}
