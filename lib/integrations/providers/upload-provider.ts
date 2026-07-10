import type { IntegrationProviderId } from "../types";

/** Input for uploading a generated deliverable file. */
export type UploadFileInput = {
  fileName: string;
  mimeType: string;
  buffer: Buffer;
  projectName: string;
  workflowId?: string | null;
};

/** Result from a successful external upload. */
export type UploadFileResult = {
  externalFileId: string;
  externalUrl: string;
  storagePath: string;
  folderUrl?: string;
};

/**
 * Generic upload contract — Google Drive is the first implementation.
 * Future providers (Dropbox, S3, etc.) implement the same interface.
 */
export interface UploadProvider {
  readonly providerId: IntegrationProviderId;
  uploadFile(
    integrationId: string,
    input: UploadFileInput,
  ): Promise<UploadFileResult>;
  getStorageLocation(projectName: string): string;
}
