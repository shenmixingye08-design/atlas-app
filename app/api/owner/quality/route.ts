import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { buildQualityDashboardSnapshot } from "@/lib/quality-assurance/aggregator";
import { runEvidenceSuite } from "@/lib/quality-assurance/run-evidence-suite";
import type { ReliabilityWindow } from "@/lib/reliability/metrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseWindow(raw: string | null): ReliabilityWindow {
  if (raw === "30") return 30;
  if (raw === "90") return 90;
  return 7;
}

export async function GET(request: Request): Promise<Response> {
  await requireAtlasOwner();
  const url = new URL(request.url);
  const windowDays = parseWindow(url.searchParams.get("windowDays"));
  const snapshot = await buildQualityDashboardSnapshot({ windowDays });
  return Response.json({ ok: true, ...snapshot });
}

/**
 * Opt-in evidence suite run (承認後実行).
 * Body: { "runSuite": true }
 * Never auto-runs on page load — cost / side-effect control.
 */
export async function POST(request: Request): Promise<Response> {
  await requireAtlasOwner();
  let body: { runSuite?: boolean } = {};
  try {
    body = (await request.json()) as { runSuite?: boolean };
  } catch {
    body = {};
  }
  if (!body.runSuite) {
    return Response.json(
      { ok: false, error: "runSuite confirmation required" },
      { status: 400 }
    );
  }
  const evidence = await runEvidenceSuite({
    productionBaseUrl: process.env.PRODUCTION_E2E_BASE_URL ?? null,
  });
  const snapshot = await buildQualityDashboardSnapshot({
    evidence,
    windowDays: 7,
  });
  return Response.json({ ok: true, evidence, snapshot });
}
