import { getMemoryApplyMetrics, listMemoryApplyEvents } from "@/lib/memory-apply/metrics";
import { auditMemoryApplyCoverage } from "@/lib/memory-apply/audit";
import {
  MEMORY_PATH_DIAGRAM,
  proveMemoryShare,
} from "@/lib/memory-apply/share-proof";
import { AI_SECRETARY_MEMORY_CHANNELS } from "@/lib/memory-apply/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId")?.trim() || undefined;

  const metrics = getMemoryApplyMetrics(userId);
  const audit = auditMemoryApplyCoverage(userId);
  const recent = listMemoryApplyEvents(userId).slice(0, 30);
  const share = userId
    ? proveMemoryShare(userId)
    : {
        shareRatePercent: 0,
        unappliedCount: AI_SECRETARY_MEMORY_CHANNELS.length,
        missingChannels: [...AI_SECRETARY_MEMORY_CHANNELS],
        pass: false,
        notes: ["userId query required for share-rate proof"],
      };

  // Viewing health counts as dashboard channel activity (metrics surface).
  const { recordMemoryApplyEvent } = await import("@/lib/memory-apply/metrics");
  recordMemoryApplyEvent({
    userId: userId ?? "system",
    channel: "dashboard",
    memoryMode: "on",
    applied: true,
    success: true,
    improvementRate: metrics.averageImprovementRate,
  });

  return Response.json({
    ok: audit.pass && (userId ? share.pass : audit.pass),
    pathDiagram: MEMORY_PATH_DIAGRAM,
    aiSecretaryChannels: AI_SECRETARY_MEMORY_CHANNELS,
    share,
    metrics: getMemoryApplyMetrics(userId),
    audit: auditMemoryApplyCoverage(userId),
    recent,
    checkedAt: new Date().toISOString(),
  });
}
