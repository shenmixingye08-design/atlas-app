import { getHealthVersionPayload } from "@/lib/health/version-info";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Public, secret-free deployment identity.
 * Used to verify Production alias points at the expected Git commit.
 */
export async function GET(): Promise<Response> {
  return Response.json(getHealthVersionPayload(), {
    headers: {
      "Cache-Control": "no-store, max-age=0",
    },
  });
}
