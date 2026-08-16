import { requireAtlasOwnerApi } from "@/lib/auth/require-atlas-owner";
import { listNotificationDlq } from "@/lib/notifications/dlq";
import {
  getCircuitBreakerSnapshot,
  getReliabilityMetricsSnapshot,
  getReliabilityWindowMetrics,
} from "@/lib/reliability";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Owner-only: measurable success rates + 7/30/90 windows + DLQ + circuits. */
export async function GET(): Promise<Response> {
  const owner = await requireAtlasOwnerApi();
  if (!owner.ok) return owner.response;
  const snapshot = getReliabilityMetricsSnapshot();
  const windows = await getReliabilityWindowMetrics([7, 30, 90]);
  const dlq = await listNotificationDlq(50);
  const circuits = getCircuitBreakerSnapshot();

  return Response.json({
    ok: true,
    ...snapshot,
    windows,
    dlq,
    circuits,
    note: "null rate means unmeasured — treat as 0 for quality gates",
  });
}
