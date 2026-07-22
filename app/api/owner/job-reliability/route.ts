import { requireAtlasOwner } from "@/lib/auth/require-atlas-owner";
import { getJobMetrics24h } from "@/lib/jobs/job-store";

/** Owner-only 24h job + push reliability metrics (no user secrets). */
export async function GET(): Promise<Response> {
  await requireAtlasOwner();

  const jobMetrics = await getJobMetrics24h();

  let pushInvalidDevices = 0;
  try {
    const { createServiceRoleClientIfConfigured } = await import(
      "@/lib/supabase/service-role"
    );
    const client = createServiceRoleClientIfConfigured();
    if (client) {
      const { count } = await client
        .from("atlas_push_subscriptions")
        .select("*", { count: "exact", head: true })
        .eq("is_active", false)
        .gte("failure_count", 5);
      pushInvalidDevices = count ?? 0;
    }
  } catch {
    pushInvalidDevices = 0;
  }

  return Response.json({
    jobs: jobMetrics,
    push: {
      invalidDevices: pushInvalidDevices,
    },
    generatedAt: new Date().toISOString(),
  });
}
