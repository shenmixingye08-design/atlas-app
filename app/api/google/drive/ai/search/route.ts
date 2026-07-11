import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  aiSearchGoogleDriveForUser,
  parseDriveCategoryParam,
} from "@/lib/integrations/google/drive/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    query?: string;
    category?: string;
  } | null;

  if (!body?.query?.trim()) {
    return Response.json(
      { status: "error", message: "query is required" },
      { status: 400 },
    );
  }

  const category = parseDriveCategoryParam(body.category ?? null) ?? "all";
  const context = await resolveFeatureAccessContext();

  try {
    const result = await aiSearchGoogleDriveForUser({
      userId,
      context,
      query: body.query.trim(),
      category,
    });

    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to AI-search Drive";
    recordGoogleAuthFailure(message, "google_drive_ai_search");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}
