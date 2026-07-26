import { NextResponse } from "next/server";

import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getJobMetrics24h, listRecentJobs } from "@/lib/jobs/job-store";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAtlasOwner();
  const [jobs, metrics] = await Promise.all([
    listRecentJobs({ limit: 200 }),
    getJobMetrics24h(),
  ]);

  return NextResponse.json({
    jobs,
    metrics,
    generatedAt: new Date().toISOString(),
  });
}
