import { checkAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getMonthlyCostSavingsSummary } from "@/lib/cost-optimization/cost-savings-tracker";

/** Owner-only aggregate cost metrics (P0-03 — not per-user tenant data). */
export async function GET(): Promise<Response> {
  if (!(await checkAtlasOwner())) {
    return Response.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const summary = getMonthlyCostSavingsSummary();
  return Response.json(summary);
}
