import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import {
  buildBenchmarkOverview,
  buildKindBenchmarkRows,
  buildTrendSeries,
  compareBenchmarkRecords,
  createAndExecuteBenchmarkRun,
  detectQualityRegressions,
  estimateBenchmarkCostUsd,
  exportBenchmarkCsv,
  exportBenchmarkJson,
  listBenchmarkCases,
  listBenchmarkRecords,
  listBenchmarkRuns,
  pairSmartContextAb,
  rankImprovementPriority,
  updateBenchmarkRecord,
  type BenchmarkRunConfig,
  type OwnerEvaluation,
} from "@/lib/quality-engine/benchmark";

export const dynamic = "force-dynamic";

/** Owner-only Quality Benchmark dashboard + run control. */
export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const url = new URL(request.url);
  const format = url.searchParams.get("export");
  const records = listBenchmarkRecords(500);

  if (format === "csv") {
    return new Response(exportBenchmarkCsv(records), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": 'attachment; filename="quality-benchmark.csv"',
      },
    });
  }
  if (format === "json") {
    return new Response(exportBenchmarkJson(records), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": 'attachment; filename="quality-benchmark.json"',
      },
    });
  }

  return Response.json({
    overview: buildBenchmarkOverview(records),
    byKind: buildKindBenchmarkRows(records),
    trends: {
      quality: buildTrendSeries(records, "quality"),
      cost: buildTrendSeries(records, "cost"),
      tokens: buildTrendSeries(records, "tokens"),
      time: buildTrendSeries(records, "time"),
    },
    matrix: rankImprovementPriority(records).slice(0, 50),
    regressions: detectQualityRegressions(records),
    smartContextAb: pairSmartContextAb(records),
    cases: listBenchmarkCases(),
    runs: listBenchmarkRuns(30),
    records: records.slice(0, 100),
  });
}

export async function POST(request: Request): Promise<Response> {
  const owner = await requireAtlasOwner();
  const body = (await request.json()) as {
    action?: string;
    config?: BenchmarkRunConfig;
    confirmCost?: boolean;
    recordId?: string;
    ownerEvaluation?: OwnerEvaluation;
    compare?: { a: string; b: string };
  };

  if (body.action === "compare" && body.compare) {
    const records = listBenchmarkRecords(500);
    const a = records.find((r) => r.id === body.compare!.a);
    const b = records.find((r) => r.id === body.compare!.b);
    if (!a || !b) {
      return Response.json({ error: "record_not_found" }, { status: 404 });
    }
    return Response.json({ comparison: compareBenchmarkRecords(a, b) });
  }

  if (body.action === "owner_feedback" && body.recordId && body.ownerEvaluation) {
    const updated = updateBenchmarkRecord(body.recordId, {
      ownerEvaluation: body.ownerEvaluation,
      usageInfo: {
        ...(listBenchmarkRecords(500).find((r) => r.id === body.recordId)
          ?.usageInfo ?? {
          downloaded: null,
          downloadCount: null,
          regenerated: null,
          regenerationCount: null,
          userRating: null,
          ownerRating: null,
          userFeedback: null,
          ownerFeedback: null,
          acceptedWithoutEdit: null,
          editedAfterGeneration: null,
          editDistance: null,
          finalUsed: null,
          failureReason: null,
        }),
        ownerRating: body.ownerEvaluation.overall,
        ownerFeedback: body.ownerEvaluation.cons || body.ownerEvaluation.pros,
      },
    });
    if (!updated) {
      return Response.json({ error: "record_not_found" }, { status: 404 });
    }
    return Response.json({ record: updated });
  }

  if (body.action === "estimate" && body.config) {
    return Response.json({
      estimatedMaxCostUsd: estimateBenchmarkCostUsd(body.config),
    });
  }

  if (body.action === "run" && body.config) {
    const result = createAndExecuteBenchmarkRun({
      createdBy: owner.email,
      config: body.config,
      confirmCost: body.confirmCost,
    });
    if (result.errors.length && result.run.status === "failed") {
      return Response.json(result, { status: 400 });
    }
    return Response.json(result);
  }

  return Response.json({ error: "invalid_action" }, { status: 400 });
}
