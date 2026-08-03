import "server-only";

import { buildFeatureAccessContext } from "@/lib/feature-flags/access";
import { uploadFileToGoogleDriveForUser } from "@/lib/integrations/google/drive/service";

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

async function validateDrive(userId: string): Promise<ValidationResult> {
  const { getGoogleDriveFoldersForUser } = await import(
    "@/lib/integrations/google/drive/service"
  );
  const access = await getGoogleDriveFoldersForUser({
    userId,
    context: buildFeatureAccessContext(null),
  });
  if (access.status !== "ready") {
    return failValidation(
      access.status === "feature_disabled"
        ? "needs_configuration"
        : "needs_connection",
      access.message,
    );
  }
  return okValidation("Google Drive接続済み");
}

export const googleDriveLiveAdapter: LiveIntegrationAdapter = {
  id: "live.google_drive.upload",
  service: "google_drive",
  mode: "production",
  availability: "available",
  classification: "production_live",
  requiresExternalActionId: true,
  validateConnection: validateDrive,
  validatePermissions: validateDrive,
  async execute(input: AdapterExecuteInput) {
    const fileName =
      input.artifactFileName ||
      (typeof input.configuration.fileName === "string"
        ? input.configuration.fileName
        : "atlas-deliverable.bin");
    const buffer = input.artifactBuffer;
    const destination =
      typeof input.configuration.folderId === "string"
        ? input.configuration.folderId
        : typeof input.configuration.saveTarget === "string"
          ? input.configuration.saveTarget
          : "drive";
    const contentHash =
      input.contentHash ??
      (buffer ? hashContent(buffer) : hashContent(fileName));
    const key = standardIdempotencyKey(
      "google_drive",
      { ...input, contentHash },
      { destination },
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

        const result = await uploadFileToGoogleDriveForUser({
          userId: input.userId,
          context: buildFeatureAccessContext(null),
          fileName,
          mimeType: input.artifactMimeType || "application/octet-stream",
          buffer,
          parentId:
            typeof input.configuration.folderId === "string"
              ? input.configuration.folderId
              : null,
        });

        if (result.status !== "ready" || !result.file?.id) {
          return buildExecutionResult({
            status:
              result.status === "feature_disabled"
                ? "needs_configuration"
                : "needs_connection",
            startedAt,
            errorCode: result.status,
            summary:
              "message" in result ? result.message : "Google Drive保存に失敗しました",
            requiresExternalActionId: false,
            costUsage: { providerCalls: 1 },
          });
        }

        if (!result.file.webViewLink) {
          return buildExecutionResult({
            status: "failed",
            startedAt,
            errorCode: "missing_external_url",
            summary: "Drive webViewLink が取得できませんでした",
            externalActionId: result.file.id,
            requiresExternalActionId: false,
            costUsage: {
              providerCalls: 1,
              bytesUploaded: buffer.length,
            },
          });
        }

        const { hashContent } = await import("../idempotency");
        const checksum = hashContent(buffer);
        return buildExecutionResult({
          status: "succeeded",
          externalActionId: result.file.id,
          externalUrl: result.file.webViewLink,
          startedAt,
          summary: `Google Driveへ保存しました: ${result.file.webViewLink}`,
          requiresExternalActionId: true,
          metadata: {
            sizeBytes: result.file.sizeBytes,
            overwritten: result.overwritten,
            checksum,
          },
          costUsage: {
            providerCalls: 1,
            bytesUploaded: buffer.length,
          },
        });
      },
    });
  },
};
