import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { summarizeDropboxFileForUser } from "@/lib/integrations/dropbox/service";
import { recordDropboxAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    path?: string;
  } | null;

  if (!body?.path?.trim()) {
    return Response.json(
      { status: "error", message: "path is required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  const { requireBillingAiUsage } = await import("@/lib/billing/access");
  const usageDenied = await requireBillingAiUsage(userId);
  if (usageDenied) return usageDenied;

  try {
    const result = await summarizeDropboxFileForUser({
      userId,
      context,
      path: body.path.trim(),
    });

    if (result.status !== "ready") {
      const statusCode =
        result.status === "feature_disabled"
          ? 403
          : result.status === "not_found"
            ? 404
            : 409;
      return Response.json(result, { status: statusCode });
    }

    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to summarize Dropbox file";
    recordDropboxAuthFailure(message, "dropbox_ai_summarize");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}
