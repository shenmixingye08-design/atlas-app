import { auth } from "@clerk/nextjs/server";

import { resolveFeatureAccessContext } from "@/lib/feature-flags/resolve-context";
import {
  createGmailLabelForUser,
  listGmailLabelsForUser,
} from "@/lib/integrations/google/gmail/service";
import { recordGoogleAuthFailure } from "@/lib/owner/error-monitoring/telemetry";

export async function GET(): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await listGmailLabelsForUser({ userId, context });
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to list Gmail labels";
    recordGoogleAuthFailure(message, "google_gmail_labels");
    return Response.json({ message }, { status: 500 });
  }
}

export async function POST(request: Request): Promise<Response> {
  const { userId } = await auth();
  if (!userId) {
    return Response.json({ message: "Unauthorized" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as {
    name?: unknown;
  } | null;
  const name = typeof body?.name === "string" ? body.name.trim() : "";
  if (!name) {
    return Response.json({ message: "Label name is required" }, { status: 400 });
  }

  const context = await resolveFeatureAccessContext();

  try {
    const result = await createGmailLabelForUser({ userId, context, name });
    if (result.status !== "ready") {
      const statusCode = result.status === "feature_disabled" ? 403 : 409;
      return Response.json(result, { status: statusCode });
    }
    return Response.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create Gmail label";
    recordGoogleAuthFailure(message, "google_gmail_create_label");
    return Response.json({ message }, { status: 500 });
  }
}
