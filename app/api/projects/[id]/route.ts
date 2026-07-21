import { auth } from "@clerk/nextjs/server";

import { loadPersistedProjectById } from "@/lib/commander/durable-store";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/**
 * Durable read of a single project (deliverable / 成果物) by its stable id.
 *
 * This is the server truth behind notification deep links
 * (`/projects/<id>`): the browser that clicks「結果を見る」may be a different
 * device or a cold start with no localStorage copy, so the result MUST be
 * loadable from the durable store keyed by id.
 *
 * Responses:
 * - 200 `{ status: "found", project }`      — durable row exists
 * - 404 `{ status: "not_found", project: null }` — confirmed no such row
 * - 200 `{ status: "unavailable", project: null }` — no durable backend (dev);
 *        the client falls back to its local cache instead of showing not-found
 * - 401 `{ status: "unauthorized" }`
 */
export async function GET(
  _request: Request,
  context: RouteContext,
): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", project: null },
      { status: 401 },
    );
  }

  const { id } = await context.params;
  if (!id?.trim()) {
    return Response.json(
      { status: "error", project: null, message: "id is required" },
      { status: 400 },
    );
  }

  const { project, found, durable } = await loadPersistedProjectById({
    userId,
    projectId: id.trim(),
  });

  if (found && project) {
    return Response.json({ status: "found", project });
  }

  if (durable) {
    return Response.json(
      { status: "not_found", project: null },
      { status: 404 },
    );
  }

  // Durable backend not configured — let the client decide using its cache.
  return Response.json({ status: "unavailable", project: null });
}
