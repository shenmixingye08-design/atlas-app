import { auth } from "@clerk/nextjs/server";

import {
  getWorkProgressSnapshot,
  listWorkProgressSnapshots,
} from "@/lib/work-progress/server-snapshot";

/**
 * Read-only progress / log API for the trust UX.
 * Does not start AI work — only surfaces commander + reliability state.
 */
export async function GET(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const runId = url.searchParams.get("runId");

  try {
    if (runId) {
      const snapshot = await getWorkProgressSnapshot(userId, runId);
      if (!snapshot) {
        return Response.json({ error: "Run not found" }, { status: 404 });
      }
      return Response.json({ snapshot });
    }

    const snapshots = await listWorkProgressSnapshots(userId, 12);
    return Response.json({ snapshots });
  } catch (error) {
    console.error("[Atlas /api/work-progress]", error);
    return Response.json({ error: "Failed to load work progress" }, { status: 500 });
  }
}
