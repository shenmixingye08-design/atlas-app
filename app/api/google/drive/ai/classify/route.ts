import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import { classifyGoogleDriveFileForUser } from "@/lib/integrations/google/drive/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";
import { clientSafeMessage } from "@/lib/security/client-safe-message";

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json(
      { status: "unauthorized", message: "Unauthorized" },
      { status: 401 },
    );
  }

  const body = (await request.json().catch(() => null)) as {
    fileId?: string;
  } | null;

  if (!body?.fileId?.trim()) {
    return Response.json(
      { status: "error", message: "fileId is required" },
      { status: 400 },
    );
  }

  const context = await resolveFeatureAccessContext();

  const { requireAndConsumeAiJob } = await import("@/lib/billing/access");
  const usageDenied = await requireAndConsumeAiJob(
    userId,
    "drive_classify",
    request.headers.get("idempotency-key")?.trim() || crypto.randomUUID(),
  );
  if (usageDenied) return usageDenied;

  try {
    const result = await classifyGoogleDriveFileForUser({
      userId,
      context,
      fileId: body.fileId.trim(),
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
      clientSafeMessage(error, "Failed to classify Drive file");
    recordGoogleAuthFailure(message, "google_drive_ai_classify");
    return Response.json({ status: "error", message }, { status: 500 });
  }
}
