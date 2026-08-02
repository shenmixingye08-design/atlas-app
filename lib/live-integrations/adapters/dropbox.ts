/**
 * Live Dropbox adapter — folder ensure, upload, revision, duplicate prevention.
 */

import "server-only";

import {
  ensureDropboxFolderForUser,
  uploadDropboxFileForUser,
} from "@/lib/integrations/dropbox/service";
import { resolveFeatureAccessContextForUser } from "@/lib/live-integrations/context";
import {
  claimLiveActionOnce,
  fingerprintLiveAction,
} from "@/lib/live-integrations/duplicate";
import { withLiveRetry } from "@/lib/live-integrations/retry";
import { getLiveIntegrationStatus } from "@/lib/live-integrations/status";
import type { LiveAdapterResult } from "@/lib/live-integrations/types";

export type DropboxLiveInput = {
  fileName: string;
  contentBase64?: string;
  contentText?: string;
  parentPath: string;
  overwrite?: boolean;
  ensureFolder?: boolean;
};

function fail(
  summary: string,
  opts?: Partial<LiveAdapterResult>,
): LiveAdapterResult {
  return {
    ok: false,
    summary,
    externalId: null,
    url: null,
    errorCode: opts?.errorCode ?? "execution_failed",
    errorMessage: opts?.errorMessage ?? summary,
    needsReconnect: opts?.needsReconnect ?? false,
    retryable: opts?.retryable ?? false,
    skippedDuplicate: opts?.skippedDuplicate ?? false,
  };
}

function ok(
  summary: string,
  externalId: string | null,
  url: string | null = null,
): LiveAdapterResult {
  return {
    ok: true,
    summary,
    externalId,
    url,
    errorCode: null,
    errorMessage: null,
    needsReconnect: false,
    retryable: false,
    skippedDuplicate: false,
  };
}

export async function executeDropboxLive(
  userId: string,
  input: DropboxLiveInput,
): Promise<LiveAdapterResult> {
  const status = await getLiveIntegrationStatus(userId, "dropbox");
  if (status.status !== "connected") {
    return fail(status.message, {
      errorCode: status.status,
      needsReconnect: status.status !== "not_connected",
    });
  }

  const parentPath = input.parentPath.trim();
  if (!parentPath) {
    return fail("Dropboxの保存先フォルダを選択してください", {
      errorCode: "missing_folder",
    });
  }

  const buffer = input.contentBase64
    ? Buffer.from(input.contentBase64, "base64")
    : Buffer.from(input.contentText ?? "", "utf8");

  const fingerprint = fingerprintLiveAction({
    userId,
    service: "dropbox",
    action: input.overwrite ? "overwrite" : "upload",
    target: `${parentPath}/${input.fileName}`,
    content: buffer.toString("base64").slice(0, 2000),
  });
  const claim = claimLiveActionOnce(fingerprint);
  if (claim.duplicate) {
    return fail("同じファイルの重複保存を防止しました。", {
      errorCode: "duplicate_prevented",
      skippedDuplicate: true,
    });
  }

  const context = await resolveFeatureAccessContextForUser(userId);

  try {
    if (input.ensureFolder !== false) {
      await ensureDropboxFolderForUser({
        userId,
        context,
        path: parentPath.startsWith("/") ? parentPath : `/${parentPath}`,
      });
    }

    const result = await withLiveRetry(
      () =>
        uploadDropboxFileForUser({
          userId,
          context,
          fileName: input.fileName,
          buffer,
          parentPath,
          overwrite: input.overwrite,
          ensureFolder: false,
        }),
      "dropbox.upload",
    );

    if (result.status !== "ready") {
      return fail(result.message, {
        errorCode: result.status,
        needsReconnect: result.status === "dropbox_not_connected",
      });
    }

    return ok(
      "Dropboxに保存しました",
      result.file.id,
      result.file.sharedLinkUrl,
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Dropbox保存に失敗しました";
    const auth = /expired|reconnect|unauthorized|401/i.test(message);
    return fail(message.slice(0, 280), {
      errorCode: auth ? "auth_failed" : "execution_failed",
      needsReconnect: auth,
      retryable: !auth,
    });
  }
}
