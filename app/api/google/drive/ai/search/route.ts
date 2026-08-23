import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  respondGoogleDriveCaught,
  respondGoogleDriveResult,
} from "@/lib/integrations/google/drive/http";
import {
  aiSearchGoogleDriveForUser,
  parseDriveCategoryParam,
} from "@/lib/integrations/google/drive/service";

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

  const { requireAndConsumeAiJob } = await import("@/lib/billing/access");
  const usageDenied = await requireAndConsumeAiJob(
    userId,
    "drive_search",
    request.headers.get("idempotency-key")?.trim() || crypto.randomUUID(),
  );
  if (usageDenied) return usageDenied;

  try {
    const result = await aiSearchGoogleDriveForUser({
      userId,
      context,
      query: body.query.trim(),
      category,
    });

    return respondGoogleDriveResult(result);
  } catch (error) {
    return respondGoogleDriveCaught(
      error,
      "Google DriveのAI検索に失敗しました",
      "google_drive_ai_search",
    );
  }
}
