import { buildVisionAdminMetrics } from "@/lib/vision/metrics";
import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Owner-only vision diagnostics metrics.
 * timeout件数 / 平均応答時間 / 成功率 — no image bytes or secrets.
 */
export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const url = new URL(request.url);
  const daysRaw = Number(url.searchParams.get("days") ?? "7");
  const days =
    Number.isFinite(daysRaw) && daysRaw > 0 && daysRaw <= 90 ? daysRaw : 7;
  const sinceMs = Date.now() - days * 24 * 60 * 60 * 1000;
  const metrics = buildVisionAdminMetrics({ sinceMs });

  return Response.json({
    ok: true,
    days,
    metrics,
    note: "timeout は一時エラーとして集計し、解析失敗（analysisFailure）と区別します。",
  });
}
