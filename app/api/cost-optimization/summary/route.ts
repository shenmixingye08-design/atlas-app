import { getMonthlyCostSavingsSummary } from "@/lib/cost-optimization/cost-savings-tracker";

export async function GET(): Promise<Response> {
  const summary = getMonthlyCostSavingsSummary();
  return Response.json(summary);
}
