/**
 * Dropbox Production Live Adapter.
 * Never falls back to sandbox/mock success.
 */

import "server-only";

import type { StoredDeliverable } from "@/lib/deliverables/store";

import { validateDropboxConnection, validateDropboxScopes } from "./connection";
import {
  buildDropboxResultHash,
  findDropboxUploadByIdempotency,
  saveDropboxUploadAction,
} from "./idempotency";
import { resolveDropboxUploadInput } from "./input";
import {
  recordDropboxDuplicatePrevented,
  recordDropboxPermissionError,
  recordDropboxRetry,
  recordDropboxScopeError,
  recordDropboxTokenRefresh,
  recordDropboxUploadAttempt,
  recordDropboxUploadFailure,
  recordDropboxUploadSuccess,
  recordDropboxVerificationFailure,
} from "./metrics";
import { classifyDropboxProviderError, withDropboxRetry } from "./retry";
import { resolveTargetFolder } from "./folder";
import { getExternalDropboxFile, uploadAndVerifyDropboxFile } from "./upload";
import {
  DROPBOX_ADAPTER_MODE,
  type DropboxUploadAdapterResult,
} from "./types";

function resolveEnvironment(): string {
  return (
    process.env.VERCEL_ENV?.trim() ||
    process.env.NODE_ENV?.trim() ||
    "development"
  );
}

export const dropboxLiveAdapter = {
  mode: DROPBOX_ADAPTER_MODE,

  async validateConnection(ownerId: string) {
    return validateDropboxConnection(ownerId);
  },

  async validateScopes(ownerId: string) {
    return validateDropboxScopes(ownerId);
  },

  async resolveTargetFolder(input: {
    accessToken: string;
    folderPath: string | null;
    fileName: string;
    createFolderIfMissing: boolean;
  }) {
    return resolveTargetFolder(input);
  },

  async refreshToken(ownerId: string) {
    const result = await validateDropboxConnection(ownerId);
    if (result.refreshed) recordDropboxTokenRefresh();
    return result;
  },

  async getExternalResult(input: {
    accessToken: string;
    fileId: string;
    path?: string;
  }) {
    return getExternalDropboxFile(input);
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
  }): Promise<DropboxUploadAdapterResult> {
    const startedAt = new Date().toISOString();
    const startedMs = Date.now();
    let retryCount = 0;

    try {
      const connection = await this.validateConnection(input.ownerId);
      if (connection.refreshed) recordDropboxTokenRefresh();
      if (!connection.ready || !connection.accessToken) {
        if (connection.health === "missing_scope") recordDropboxScopeError();
        if (
          connection.health === "revoked" ||
          connection.health === "reconnect_required"
        ) {
          recordDropboxPermissionError();
        }
        recordDropboxUploadAttempt(Date.now() - startedMs);
        recordDropboxUploadFailure();
        return {
          ok: false,
          errorCode:
            connection.health === "missing_scope"
              ? "dropbox_missing_scope"
              : connection.health === "disconnected"
                ? "dropbox_not_connected"
                : "dropbox_reconnect_required",
          errorMessage: connection.message ?? "Dropbox is not ready",
          retryable: false,
          connectionHealth: connection.health,
          needsUserInput: true,
          retryCount: 0,
        };
      }

      const folderPath =
        typeof input.configuration.folderPath === "string"
          ? input.configuration.folderPath
          : typeof input.configuration.saveTarget === "string"
            ? input.configuration.saveTarget
            : null;

      const fileName =
        typeof input.configuration.fileName === "string"
          ? input.configuration.fileName
          : input.artifact.fileName;

      const folder = await this.resolveTargetFolder({
        accessToken: connection.accessToken,
        folderPath,
        fileName,
        createFolderIfMissing:
          input.configuration.createFolderIfMissing !== false,
      });

      const uploadInput = resolveDropboxUploadInput({
        ownerId: input.ownerId,
        organizationId: input.organizationId ?? null,
        runId: input.runId,
        stepId: input.stepId,
        diagnosticId: input.diagnosticId,
        configuration: input.configuration,
        inputBindings: input.inputBindings,
        artifact: input.artifact,
        resolvedTargetPath: folder.targetPath,
      });

      const existing = await findDropboxUploadByIdempotency({
        ownerId: input.ownerId,
        idempotencyKey: uploadInput.idempotencyKey,
      });
      if (existing) {
        const verified = await getExternalDropboxFile({
          accessToken: connection.accessToken,
          fileId: existing.fileId,
          path: existing.pathDisplay,
        });
        if (
          verified.fileId !== existing.fileId ||
          verified.deleted ||
          verified.size !== existing.size
        ) {
          recordDropboxVerificationFailure();
          throw new Error("verification failed: idempotent file not re-fetchable");
        }
        recordDropboxDuplicatePrevented();
        recordDropboxUploadAttempt(Date.now() - startedMs);
        recordDropboxUploadSuccess();
        return {
          ok: true,
          folder,
          action: {
            ...existing,
            pathDisplay: verified.pathDisplay,
            rev: verified.rev,
            sharedLinkUrl: existing.sharedLinkUrl,
            duplicatePrevented: true,
          },
        };
      }

      const retried = await withDropboxRetry(async () =>
        uploadAndVerifyDropboxFile({
          accessToken: connection.accessToken!,
          targetPath: uploadInput.targetPath,
          buffer: input.artifact.buffer,
          conflictPolicy: uploadInput.conflictPolicy,
          contentHash: uploadInput.contentHash,
          createSharedLink: uploadInput.createSharedLink,
        }),
      );
      retryCount = retried.retryCount;
      if (retryCount > 0) {
        for (let i = 0; i < retryCount; i += 1) recordDropboxRetry();
      }

      const uploaded = retried.value;
      if (uploaded.size !== uploadInput.size) {
        recordDropboxVerificationFailure();
        throw new Error("verification failed: size mismatch after upload");
      }
      if (uploaded.contentHash && uploaded.contentHash !== uploadInput.contentHash) {
        recordDropboxVerificationFailure();
        throw new Error("verification failed: content_hash mismatch after upload");
      }

      const completedAt = new Date().toISOString();
      const actionBase = {
        fileId: uploaded.fileId,
        pathDisplay: uploaded.pathDisplay,
        rev: uploaded.rev,
        size: uploaded.size,
        contentHash: uploadInput.contentHash,
        targetPath: uploadInput.targetPath,
      };
      const action = {
        externalActionId: `dropbox_${uploaded.fileId}`,
        service: "dropbox" as const,
        providerRequestId: uploaded.providerRequestId,
        fileId: uploaded.fileId,
        pathDisplay: uploaded.pathDisplay,
        rev: uploaded.rev,
        size: uploaded.size,
        contentHash: uploadInput.contentHash,
        targetPath: uploadInput.targetPath,
        fileName: uploaded.fileName,
        mimeType: uploadInput.mimeType,
        sharedLinkUrl: uploaded.sharedLinkUrl,
        status: "verified" as const,
        startedAt,
        completedAt,
        retryCount,
        idempotencyKey: uploadInput.idempotencyKey,
        adapterMode: DROPBOX_ADAPTER_MODE,
        environment: resolveEnvironment(),
        diagnosticId: uploadInput.diagnosticId,
        resultHash: buildDropboxResultHash(actionBase),
        duplicatePrevented: false,
      };

      await saveDropboxUploadAction(
        action,
        input.ownerId,
        uploadInput.organizationId,
        input.runId,
        input.stepId,
        uploadInput.artifactId,
      );

      recordDropboxUploadAttempt(Date.now() - startedMs);
      recordDropboxUploadSuccess();
      return { ok: true, action, folder };
    } catch (error) {
      const classified = classifyDropboxProviderError(error);
      if (classified.errorCode === "dropbox_permission_denied") {
        recordDropboxPermissionError();
      }
      if (classified.errorCode === "dropbox_auth_failed") {
        recordDropboxPermissionError();
      }
      if (/verification failed/i.test(String(error))) {
        recordDropboxVerificationFailure();
      }
      recordDropboxUploadAttempt(Date.now() - startedMs);
      recordDropboxUploadFailure();
      return {
        ok: false,
        errorCode: classified.errorCode,
        errorMessage: error instanceof Error ? error.message : String(error),
        retryable: classified.retryable,
        needsUserInput:
          classified.errorCode === "dropbox_permission_denied" ||
          classified.errorCode === "dropbox_auth_failed" ||
          classified.errorCode === "dropbox_folder_not_found",
        retryCount,
      };
    }
  },
};

export type DropboxLiveAdapter = typeof dropboxLiveAdapter;
