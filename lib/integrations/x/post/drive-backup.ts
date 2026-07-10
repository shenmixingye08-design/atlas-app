import "server-only";

import { getClerkUserPrimaryEmail } from "@/lib/auth/get-clerk-user-email";
import { buildFeatureAccessContext, isFeatureEnabled } from "@/lib/feature-flags/access";
import type { FeatureAccessContext } from "@/lib/feature-flags/types";
import { getExternalServiceConnection } from "@/lib/integrations/external-services/store";
import {
  createDriveFile,
  ensureAtlasDriveFolders,
} from "@/lib/integrations/google/drive/api-client";
import { getGoogleAccountAccessToken } from "@/lib/integrations/google/token-manager";

export async function resolveFeatureContextForUser(
  userId: string,
): Promise<FeatureAccessContext> {
  const email = await getClerkUserPrimaryEmail(userId);
  return buildFeatureAccessContext(email);
}

/** Save post text to Google Drive SNS folder when Google feature is ON and connected. */
export async function savePostTextToGoogleDriveIfEnabled(input: {
  userId: string;
  text: string;
  context: FeatureAccessContext;
  fileNamePrefix?: string;
}): Promise<string | null> {
  if (!isFeatureEnabled("google", input.context)) {
    return null;
  }

  const connection = getExternalServiceConnection(input.userId, "google");
  if (connection.status !== "connected") {
    return null;
  }

  const accessToken = await getGoogleAccountAccessToken(input.userId);
  if (!accessToken) {
    return null;
  }

  const folders = await ensureAtlasDriveFolders({
    accessToken,
    userId: input.userId,
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const prefix = input.fileNamePrefix?.trim() || "x-post";
  const fileName = `${prefix}-${timestamp}.txt`;

  const file = await createDriveFile({
    accessToken,
    fileName,
    mimeType: "text/plain",
    buffer: Buffer.from(input.text, "utf-8"),
    parentFolderId: folders.categories.sns.folderId,
    category: "sns",
  });

  return file.webViewLink ?? null;
}
