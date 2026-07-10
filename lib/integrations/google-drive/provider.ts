import "server-only";

import type {
  UploadFileInput,
  UploadFileResult,
  UploadProvider,
} from "../providers/upload-provider";

import {
  buildStorageLocation,
  resolveProjectFolder,
  uploadFileToDrive,
} from "./client";

export const googleDriveUploadProvider: UploadProvider = {
  providerId: "google_drive",

  getStorageLocation(projectName: string): string {
    return buildStorageLocation(projectName);
  },

  async uploadFile(
    integrationId: string,
    input: UploadFileInput,
  ): Promise<UploadFileResult> {
    const { folderId, storagePath, folderUrl } = await resolveProjectFolder(
      integrationId,
      input.projectName,
    );

    const uploaded = await uploadFileToDrive(integrationId, {
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer: input.buffer,
      parentFolderId: folderId,
    });

    return {
      externalFileId: uploaded.fileId,
      externalUrl: uploaded.fileUrl,
      storagePath,
      folderUrl,
    };
  },
};
