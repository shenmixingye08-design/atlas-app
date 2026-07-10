import type { IntegrationProviderId } from "../types";

import { googleDriveUploadProvider } from "../google-drive/provider";
import type { UploadProvider } from "./upload-provider";

const uploadProviders: Partial<Record<IntegrationProviderId, UploadProvider>> = {
  google_drive: googleDriveUploadProvider,
};

export function getUploadProvider(
  providerId: IntegrationProviderId,
): UploadProvider | null {
  return uploadProviders[providerId] ?? null;
}

export function listUploadCapableProviders(): IntegrationProviderId[] {
  return Object.keys(uploadProviders) as IntegrationProviderId[];
}
