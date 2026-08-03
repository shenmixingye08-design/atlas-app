/**
 * Google Drive Production Live Adapter.
 * Never falls back to sandbox/mock success.
 */

import "server-only";

import type { StoredDeliverable } from "@/lib/deliverables/store";

import { validateDriveConnection, validateDriveScopes } from "./connection";
import {
  buildDriveResultHash,
  findDriveUploadByIdempotency,
  saveDriveUploadAction,
} from "./idempotency";
import { resolveDriveUploadInput } from "./input";
import {
  recordDriveDuplicatePrevented,
  recordDrivePermissionError,
  recordDriveRetry,
  recordDriveScopeError,
  recordDriveTokenRefresh,
  recordDriveUploadAttempt,
  recordDriveUploadFailure,
  recordDriveUploadSuccess,
  recordDriveVerificationFailure,
} from "./metrics";
import { classifyDriveProviderError, withDriveRetry } from "./retry";
import { resolveTargetFolder } from "./folder";
import { getExternalDriveFile, uploadAndVerifyDriveFile } from "./upload";
import {
  DRIVE_ADAPTER_MODE,
  type DriveUploadAdapterResult,
} from "./types";

function resolveEnvironment(): string {
  return (
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "development"
  );
}

export const googleDriveLiveAdapter = {
  mode: DRIVE_ADAPTER_MODE,

  async validateConnection(ownerId: string) {
    return validateDriveConnection(ownerId);
  },

  async validateScopes(ownerId: string) {
    return validateDriveScopes(ownerId);
  },

  async resolveTargetFolder(input: {
    accessToken: string;
    userId: string;
    targetFolderId: string | null;
    folderPath: string | null;
    createFolderIfMissing: boolean;
  }) {
    return resolveTargetFolder(input);
  },

  async refreshToken(ownerId: string) {
    const result = await validateDriveConnection(ownerId);
    if (result.refreshed) recordDriveTokenRefresh();
    return result;
  },

  async getExternalResult(input: {
    accessToken: string;
    fileId: string;
  }) {
    return getExternalDriveFile(input);
  },

  async uploadFile(input: {
    ownerId: string;
    organizationId?: string | null;
    runId: string;
    stepId: string;
    diagnosticId?: string | null;
    configuration: Readonly<Record<string, unknown>>;
    inputBindings: Readonly<Record<string, unknown>>;
    artifact: StoredDeliverable;
  }): Promise<DriveUploadAdapterResult> {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let retryCount = 0;

    try {
      const connection = await this.validateConnection(input.ownerId);
      if (connection.refreshed) recordDriveTokenRefresh();
      if (!connection.ready || !connection.accessToken) {
        if (connection.health === "missing_scope") recordDriveScopeError();
        if (
          connection.health === "revoked" ||
          connection.health === "reconnect_required"
        ) {
          recordDrivePermissionError();
        }
        recordDriveUploadAttempt(Date.now() - startedMs);
        recordDriveUploadFailure();
        return {
          ok: false,
          errorCode:
            connection.health === "missing_scope"
              ? "drive_missing_scope"
              : connection.health === "disconnected"
                ? "drive_not_connected"
                : "drive_reconnect_required",
          errorMessage: connection.message ?? "Google Drive is not ready",
          retryable: false,
          connectionHealth: connection.health,
          needsUserInput: true,
          retryCount: 0,
        };
      }

      const folder = await this.resolveTargetFolder({
        accessToken: connection.accessToken,
        userId: input.ownerId,
        targetFolderId:
          typeof input.configuration.targetFolderId === "string"
            ? input.configuration.targetFolderId
            : typeof input.configuration.folderId === "string"
              ? input.configuration.folderId
              : null,
        folderPath:
          typeof input.configuration.folderPath === "string"
            ? input.configuration.folderPath
            : typeof input.configuration.saveTarget === "string"
              ? input.configuration.saveTarget
              : null,
        createFolderIfMissing:
          input.configuration.createFolderIfMissing !== false,
      });

      const uploadInput = resolveDriveUploadInput({
        ownerId: input.ownerId,
        organizationId: input.organizationId ?? null,
        runId: input.runId,
        stepId: input.stepId,
        diagnosticId: input.diagnosticId,
        configuration: input.configuration,
        inputBindings: input.inputBindings,
        artifact: input.artifact,
        resolvedFolderId: folder.folderId,
      });

      const existing = await findDriveUploadByIdempotency({
        ownerId: input.ownerId,
        idempotencyKey: uploadInput.idempotencyKey,
      });
      if (existing) {
        // Restore provider truth — do not invent success from cache alone.
        const verified = await getExternalDriveFile({
          accessToken: connection.accessToken,
          fileId: existing.fileId,
        });
        if (
          verified.fileId !== existing.fileId ||
          !verified.webViewLink ||
          verified.trashed
        ) {
          recordDriveVerificationFailure();
          throw new Error("verification failed: idempotent file not re-fetchable");
        }
        recordDriveDuplicatePrevented();
        recordDriveUploadAttempt(Date.now() - startedMs);
        recordDriveUploadSuccess();
        return {
          ok: true,
          folder,
          action: {
            ...existing,
            webViewLink: verified.webViewLink,
            duplicatePrevented: true,
          },
        };
      }

      const retried = await withDriveRetry(async () =>
        uploadAndVerifyDriveFile({
          accessToken: connection.accessToken!,
          fileName: uploadInput.fileName,
          mimeType: uploadInput.mimeType,
          buffer: input.artifact.buffer,
          parentFolderId: folder.folderId,
          conflictPolicy: uploadInput.conflictPolicy,
          checksum: uploadInput.checksum,
        }),
      );
      retryCount = retried.retryCount;
      if (retryCount > 0) {
        for (let i = 0; i < retryCount; i += 1) recordDriveRetry();
      }

      const uploaded = retried.value;
      if (uploaded.size !== uploadInput.size) {
        recordDriveVerificationFailure();
        throw new Error("verification failed: size mismatch after upload");
      }
      if (uploaded.mimeType !== uploadInput.mimeType) {
        recordDriveVerificationFailure();
        throw new Error("verification failed: mimeType mismatch after upload");
      }

      const completedAt = new Date().toISOString();
      const actionBase = {
        fileId: uploaded.fileId,
        webViewLink: uploaded.webViewLink,
        size: uploaded.size,
        checksum: uploadInput.checksum,
        targetFolderId: folder.folderId,
      };
      const action = {
        externalActionId: `gdrive_${uploaded.fileId}`,
        service: "google_drive" as const,
        providerRequestId: uploaded.providerRequestId,
        fileId: uploaded.fileId,
        webViewLink: uploaded.webViewLink,
        targetFolderId: folder.folderId,
        fileName: uploaded.fileName,
        mimeType: uploaded.mimeType,
        size: uploaded.size,
        checksum: uploadInput.checksum,
        status: "verified" as const,
        startedAt,
        completedAt,
        retryCount,
        idempotencyKey: uploadInput.idempotencyKey,
        adapterMode: DRIVE_ADAPTER_MODE,
        environment: resolveEnvironment(),
        diagnosticId: uploadInput.diagnosticId,
        resultHash: buildDriveResultHash(actionBase),
        duplicatePrevented: false,
      };

      await saveDriveUploadAction(
        action,
        input.ownerId,
        uploadInput.organizationId,
        input.runId,
        input.stepId,
        uploadInput.artifactId,
      );

      recordDriveUploadAttempt(Date.now() - startedMs);
      recordDriveUploadSuccess();
      return { ok: true, action, folder };
    } catch (error) {
      const classified = classifyDriveProviderError(error);
      if (classified.errorCode === "drive_permission_denied") {
        recordDrivePermissionError();
      }
      if (classified.errorCode === "drive_auth_failed") {
        recordDrivePermissionError();
      }
      if (/verification failed/i.test(String(error))) {
        recordDriveVerificationFailure();
      }
      recordDriveUploadAttempt(Date.now() - startedMs);
      recordDriveUploadFailure();
      return {
        ok: false,
        errorCode: classified.errorCode,
        errorMessage: error instanceof Error ? error.message : String(error),
        retryable: classified.retryable,
        needsUserInput:
          classified.errorCode === "drive_permission_denied" ||
          classified.errorCode === "drive_auth_failed" ||
          classified.errorCode === "drive_folder_not_found",
        retryCount,
      };
    }
  },
};

export type GoogleDriveLiveAdapter = typeof googleDriveLiveAdapter;
