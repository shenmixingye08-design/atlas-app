import "server-only";

import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import {
  getDropboxFilesForUser,
  shareDropboxFileForUser,
  uploadDropboxFileForUser,
} from "@/lib/integrations/dropbox/service";

import { hashContent } from "../idempotency";
import { buildExecutionResult } from "../result";
import type {
  AdapterExecuteInput,
  LiveIntegrationAdapter,
  ValidationResult,
} from "../types";
import {
  failValidation,
  okValidation,
  standardIdempotencyKey,
  withAdapterGuards,
} from "./shared";

async function validateDropbox(userId: string): Promise<ValidationResult> {
  const result = await getDropboxFilesForUser({
    userId,
    context: buildFeatureAccessContext(null),
  });
  if (result.status !== "ready") {
    return failValidation(
      result.status === "feature_disabled"
        ? "needs_configuration"
        : "needs_connection",
      result.message,
    );
  }
  return okValidation("Dropbox接続済み");
}

export const dropboxLiveAdapter: LiveIntegrationAdapter = {
  id: "live.dropbox.upload",
  service: "dropbox",
  mode: "production",
  availability: "available",
  classification: "production_live",
  requiresExternalActionId: true,
  validateConnection: validateDropbox,
  validatePermissions: validateDropbox,
  async execute(input: AdapterExecuteInput) {
    const fileName =
      input.artifactFileName ||
      (typeof input.configuration.fileName === "string"
        ? input.configuration.fileName
        : "atlas-deliverable.bin");
    const parentPath =
      typeof input.configuration.saveTarget === "string"
        ? input.configuration.saveTarget
        : typeof input.configuration.folderPath === "string"
          ? input.configuration.folderPath
          : "";
    const buffer = input.artifactBuffer;
    const contentHash =
      input.contentHash ??
      (buffer ? hashContent(buffer) : hashContent(fileName));
    const key = standardIdempotencyKey(
      "dropbox",
      { ...input, contentHash },
      { destination: parentPath || "/" },
    );

    return withAdapterGuards({
      adapter: this,
      executeInput: input,
      idempotencyKey: key,
      run: async () => {
        const startedAt = new Date().toISOString();
        if (!buffer || buffer.length === 0) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            errorCode: "missing_artifact",
            summary: "アップロード対象の成果物がありません",
            requiresExternalActionId: false,
          });
        }
        if (!parentPath) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            errorCode: "validation_failed",
            summary: "Dropboxの保存先フォルダを選択してください",
            requiresExternalActionId: false,
          });
        }

        const uploaded = await uploadDropboxFileForUser({
          userId: input.userId,
          context: buildFeatureAccessContext(null),
          fileName,
          buffer,
          parentPath,
        });

        if (uploaded.status !== "ready" || !uploaded.file) {
          return buildExecutionResult({
            status:
              uploaded.status === "feature_disabled"
                ? "needs_configuration"
                : "needs_connection",
            startedAt,
            errorCode: uploaded.status,
            summary: "message" in uploaded ? uploaded.message : "Dropbox失敗",
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1 },
          });
        }

        const fileId = uploaded.file.id || uploaded.file.pathLower;
        let sharedUrl: string | null = uploaded.file.sharedLinkUrl;
        try {
          const shared = await shareDropboxFileForUser({
            userId: input.userId,
            context: buildFeatureAccessContext(null),
            path: uploaded.file.pathDisplay,
          });
          if (shared.status === "ready") {
            sharedUrl = shared.url;
          }
        } catch {
          // keep path as fallback url only if share fails after upload
        }

        if (!fileId) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            errorCode: "missing_external_action_id",
            summary: "Dropbox fileId/path が取得できませんでした",
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1, bytesUploaded: buffer.length },
          });
        }

        const externalUrl = sharedUrl ?? uploaded.file.pathDisplay;
        return buildExecutionResult({
          status: "succeeded",
          externalActionId: fileId,
          externalUrl,
          startedAt,
          summary: `Dropboxへ保存しました: ${externalUrl}`,
          requiresExternalActionId: true,
          metadata: { path: uploaded.file.pathDisplay },
          costUsage: {
            providerCalls: sharedUrl ? 2 : 1,
            bytesUploaded: buffer.length,
          },
        });
      },
    });
  },
};
