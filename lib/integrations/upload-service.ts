import "server-only";

import { getStoredDeliverable } from "@/lib/deliverables/store";
import type { Deliverable } from "@/lib/deliverables/types";

import { getUploadProvider } from "./providers/upload-registry";
import { serverIntegrationRepository } from "./repositories/server-integration-repository";
import { serverUploadRepository } from "./repositories/server-upload-repository";
import { withRetry } from "./retry";
import type {
  IntegrationUploadResult,
  IntegrationUploadSummary,
  UploadBatchStatus,
} from "./types";

export type UploadDeliverablesInput = {
  deliverables: readonly Deliverable[];
  projectName: string;
  workflowId?: string | null;
};

function resolveBatchStatus(
  uploads: IntegrationUploadResult[],
): UploadBatchStatus | null {
  if (uploads.length === 0) return null;

  const successCount = uploads.filter((item) => item.success).length;
  if (successCount === uploads.length) return "success";
  if (successCount === 0) return "failed";
  return "partial";
}

/**
 * Upload generated deliverables to all connected upload-capable integrations.
 * Failures are captured per file — the caller workflow is never blocked.
 */
export async function uploadDeliverablesToIntegrations(
  input: UploadDeliverablesInput,
): Promise<IntegrationUploadSummary> {
  const emptySummary: IntegrationUploadSummary = {
    workflowId: input.workflowId ?? null,
    projectName: input.projectName,
    provider: null,
    storageLocation: null,
    folderUrl: null,
    uploads: [],
    status: null,
  };

  if (input.deliverables.length === 0) {
    return emptySummary;
  }

  const connections = await serverIntegrationRepository.list({
    connected: true,
  });

  const uploadConnection = connections.find(
    (connection) => getUploadProvider(connection.provider) !== null,
  );

  if (!uploadConnection) {
    return emptySummary;
  }

  const provider = getUploadProvider(uploadConnection.provider);
  if (!provider) {
    return emptySummary;
  }

  const uploads: IntegrationUploadResult[] = [];
  let folderUrl: string | null = null;
  const storageLocation = provider.getStorageLocation(input.projectName);
  const uploadedAt = new Date().toISOString();

  for (const deliverable of input.deliverables) {
    const stored = getStoredDeliverable(deliverable.id);

    if (!stored) {
      uploads.push({
        deliverableId: deliverable.id,
        fileName: deliverable.fileName,
        provider: uploadConnection.provider,
        integrationId: uploadConnection.id,
        workflowId: input.workflowId ?? null,
        success: false,
        error: "Deliverable file buffer is no longer available on the server.",
      });
      continue;
    }

    try {
      const result = await withRetry(
        () =>
          provider.uploadFile(uploadConnection.id, {
            fileName: deliverable.fileName,
            mimeType: deliverable.mimeType,
            buffer: stored.buffer,
            projectName: input.projectName,
            workflowId: input.workflowId,
          }),
        {
          maxAttempts: 3,
          label: `Google Drive upload (${deliverable.fileName})`,
        },
      );

      folderUrl = result.folderUrl ?? folderUrl;

      const uploadResult: IntegrationUploadResult = {
        deliverableId: deliverable.id,
        fileName: deliverable.fileName,
        provider: uploadConnection.provider,
        integrationId: uploadConnection.id,
        workflowId: input.workflowId ?? null,
        success: true,
        driveFileId: result.externalFileId,
        driveUrl: result.externalUrl,
        uploadedAt,
      };

      uploads.push(uploadResult);

      await serverUploadRepository.create({
        integrationId: uploadConnection.id,
        provider: uploadConnection.provider,
        deliverableId: deliverable.id,
        workflowId: input.workflowId ?? null,
        projectName: input.projectName,
        fileName: deliverable.fileName,
        driveFileId: result.externalFileId,
        driveUrl: result.externalUrl,
        uploadedAt,
        status: "success",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Upload failed unexpectedly";

      uploads.push({
        deliverableId: deliverable.id,
        fileName: deliverable.fileName,
        provider: uploadConnection.provider,
        integrationId: uploadConnection.id,
        workflowId: input.workflowId ?? null,
        success: false,
        error: message,
      });

      await serverUploadRepository.create({
        integrationId: uploadConnection.id,
        provider: uploadConnection.provider,
        deliverableId: deliverable.id,
        workflowId: input.workflowId ?? null,
        projectName: input.projectName,
        fileName: deliverable.fileName,
        driveFileId: null,
        driveUrl: null,
        uploadedAt,
        status: "failed",
        error: message,
      });
    }
  }

  const status = resolveBatchStatus(uploads);
  const successUpload = uploads.find((item) => item.success && item.driveUrl);

  await serverIntegrationRepository.update(uploadConnection.id, {
    lastSyncAt: uploadedAt,
    metadata: {
      ...uploadConnection.metadata,
      storageLocation,
      lastUploadAt: uploadedAt,
      lastUploadStatus: status,
      lastUploadError:
        status === "failed"
          ? uploads.find((item) => item.error)?.error ?? "Upload failed"
          : status === "partial"
            ? "Some files failed to upload"
            : null,
      lastUploadDriveUrl: folderUrl ?? successUpload?.driveUrl ?? null,
      uploadedFileCount: uploads.filter((item) => item.success).length,
    },
  });

  return {
    workflowId: input.workflowId ?? null,
    projectName: input.projectName,
    provider: uploadConnection.provider,
    storageLocation,
    folderUrl,
    uploads,
    status,
  };
}
